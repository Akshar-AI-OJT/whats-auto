import { FlowStatus } from '#enums/flow_status'
import { FlowSessionStatus } from '#enums/flow_session_status'
import { FlowTriggerType } from '#enums/flow_trigger_type'
import { parseTriggerConfig, type FlowTriggerConfig } from '#lib/flow/flow_graph'
import { FlowRepository, type FlowRow } from '#repositories/flow_repository'
import { FlowSessionRepository } from '#repositories/flow_session_repository'
import type { FlowAdvanceSessionJobPayload } from '#services/flow/contracts/flow_job_payloads'
import FlowSessionLifecycleService from '#services/flow/flow_session_lifecycle_service'
import { runWithTenant } from '#services/tenant_context'

export type FlowInboundMessage = {
  organizationId: string
  conversationId: string
  contactId: string
  messageId: string
  contentText: string | null
  interactiveReplyId?: string | null
}

export type FlowRouteDecision =
  | { kind: 'none' }
  | {
      kind: 'flow'
      payload: FlowAdvanceSessionJobPayload
    }

/**
 * Decides whether inbound traffic continues an active flow, starts a published
 * flow from a trigger, or should fall through to AI debounce.
 */
export default class FlowRouterService {
  constructor(
    private sessions: FlowSessionRepository = new FlowSessionRepository(),
    private flows: FlowRepository = new FlowRepository(),
    private lifecycle: FlowSessionLifecycleService = new FlowSessionLifecycleService()
  ) {}

  async decide(inbound: FlowInboundMessage): Promise<FlowRouteDecision> {
    return runWithTenant(inbound.organizationId, async () => {
      const open = await this.sessions.findOpenForConversation({
        organizationId: inbound.organizationId,
        conversationId: inbound.conversationId,
      })

      if (open) {
        if (open.status === FlowSessionStatus.PAUSED_FOR_HUMAN) {
          return { kind: 'none' }
        }
        const decision = await this.lifecycle.inboundDecision(open)
        if (decision === 'resume') {
          return {
            kind: 'flow',
            payload: {
              organizationId: inbound.organizationId,
              conversationId: inbound.conversationId,
              contactId: inbound.contactId,
              messageId: inbound.messageId,
              contentText: inbound.contentText,
              interactiveReplyId: inbound.interactiveReplyId ?? null,
              intent: { type: 'resume', sessionId: open.id },
            },
          }
        }
      }

      const match = await this.#matchPublishedTrigger(inbound)
      if (!match) {
        return { kind: 'none' }
      }

      return {
        kind: 'flow',
        payload: {
          organizationId: inbound.organizationId,
          conversationId: inbound.conversationId,
          contactId: inbound.contactId,
          messageId: inbound.messageId,
          contentText: inbound.contentText,
          interactiveReplyId: inbound.interactiveReplyId ?? null,
          intent: {
            type: 'start',
            flowId: match.id,
            flowVersionId: match.publishedVersionId!,
          },
        },
      }
    })
  }

  async #matchPublishedTrigger(inbound: FlowInboundMessage): Promise<FlowRow | null> {
    const published = await this.flows.listPublishedForOrg(inbound.organizationId)
    if (published.length === 0) return null

    const text = inbound.contentText?.trim() ?? ''
    const keywordMatches: FlowRow[] = []
    const inboundAnyMatches: FlowRow[] = []

    for (const flow of published) {
      if (flow.status !== FlowStatus.PUBLISHED || !flow.publishedVersionId) continue
      const triggerConfig = parseTriggerConfig(flow.triggerConfig)

      if (flow.triggerType === FlowTriggerType.KEYWORD) {
        if (text && matchesKeyword(text, triggerConfig)) {
          keywordMatches.push(flow)
        }
        continue
      }

      if (flow.triggerType === FlowTriggerType.INBOUND_ANY) {
        // Interactive replies without body text still count as inbound.
        if (text || inbound.interactiveReplyId) {
          inboundAnyMatches.push(flow)
        }
        continue
      }

      // CAMPAIGN_REPLY / SUBFLOW_ENTRY are not matched from free inbound in Phase 4.
    }

    return pickPreferred(keywordMatches) ?? pickPreferred(inboundAnyMatches)
  }
}

function pickPreferred(flows: FlowRow[]): FlowRow | null {
  if (flows.length === 0) return null
  const defaults = flows.filter((flow) => flow.isDefault)
  return defaults[0] ?? flows[0] ?? null
}

export function matchesKeyword(text: string, config: FlowTriggerConfig): boolean {
  const keywords = config.keywords ?? []
  const matchType = config.matchType ?? 'exact'
  const normalized = text.trim().toLowerCase()

  for (const keyword of keywords) {
    const needle = keyword.trim()
    if (!needle) continue

    if (matchType === 'exact' && normalized === needle.toLowerCase()) {
      return true
    }
    if (matchType === 'contains' && normalized.includes(needle.toLowerCase())) {
      return true
    }
    if (matchType === 'regex') {
      try {
        if (new RegExp(needle, 'i').test(text)) return true
      } catch {
        // Invalid regex in flow config — skip this keyword.
      }
    }
  }

  return false
}
