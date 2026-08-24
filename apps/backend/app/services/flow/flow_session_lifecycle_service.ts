import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { FlowSessionStatus } from '#enums/flow_session_status'
import {
  parseFlowGraph,
  parseFlowSettings,
  type FlowExpiryMode,
  type FlowSettings,
} from '#lib/flow/flow_graph'
import { FlowExecutionLogRepository } from '#repositories/flow_execution_log_repository'
import { FlowRepository } from '#repositories/flow_repository'
import { FlowSessionRepository, type FlowSessionRow } from '#repositories/flow_session_repository'
import { repromptTextFor } from '#services/flow/flow_ai_orchestrator'
import FlowOutboundAdapter from '#services/flow/flow_outbound_adapter'
import { runWithTenant } from '#services/tenant_context'

export const FLOW_SESSION_EXPIRED_PROMPT_PREFIX =
  'Your previous step timed out. Reply to continue: '

export const FLOW_EXECUTION_LOG_RETENTION_DAYS = 30

export type FlowExpiryOutcome = 'RESUME_PROMPT' | 'RESUME_SILENT' | 'RESTART' | 'skipped'

function isExpired(session: FlowSessionRow, now = new Date()): boolean {
  return new Date(session.expiresAt).getTime() <= now.getTime()
}

function nextExpiresAt(settings: FlowSettings, now = new Date()): Date {
  return new Date(now.getTime() + settings.sessionTtlMinutes * 60_000)
}

/**
 * Session TTL expiry, human-takeover pause, and execution-log retention.
 */
export default class FlowSessionLifecycleService {
  constructor(
    private sessions: FlowSessionRepository = new FlowSessionRepository(),
    private flows: FlowRepository = new FlowRepository(),
    private logs: FlowExecutionLogRepository = new FlowExecutionLogRepository(),
    private outbound: FlowOutboundAdapter = new FlowOutboundAdapter()
  ) {}

  /**
   * Resume an open session, or treat expiry+RESTART as a fresh trigger match.
   */
  async inboundDecision(session: FlowSessionRow): Promise<'resume' | 'start_new'> {
    if (!isExpired(session)) return 'resume'
    const settings = await this.#settingsFor(session)
    if (settings.onExpiry !== 'RESTART') return 'resume'
    await this.applyExpiry(session, { notify: false })
    return 'start_new'
  }

  async applyExpiry(
    session: FlowSessionRow,
    opts: { notify: boolean }
  ): Promise<FlowExpiryOutcome> {
    if (!isExpired(session)) return 'skipped'

    const fresh = await this.sessions.findByIdForOrg({
      organizationId: session.organizationId,
      id: session.id,
    })
    if (!fresh || !isExpired(fresh)) return 'skipped'
    session = fresh

    const settings = await this.#settingsFor(session)
    const mode: FlowExpiryMode = settings.onExpiry

    if (mode === 'RESTART') {
      await this.#terminateExpired(session, settings)
      return 'RESTART'
    }

    if (mode === 'RESUME_PROMPT' && opts.notify) {
      await this.#sendExpiryPrompt(session)
    }

    const refreshed = await this.sessions.update({
      organizationId: session.organizationId,
      id: session.id,
      expiresAt: nextExpiresAt(settings),
      lastInteractionAt: new Date(),
    })
    if (!refreshed) return 'skipped'

    await this.logs.insert({
      organizationId: session.organizationId,
      flowSessionId: session.id,
      conversationId: session.conversationId,
      nodeId: session.currentNodeId,
      nodeType: 'SESSION',
      actionTaken: mode === 'RESUME_PROMPT' ? 'EXPIRY_RESUME_PROMPT' : 'EXPIRY_RESUME_SILENT',
    })

    return mode === 'RESUME_PROMPT' ? 'RESUME_PROMPT' : 'RESUME_SILENT'
  }

  async recoverExpiredSessions(params?: {
    organizationId?: string
    limit?: number
  }): Promise<{ recovered: number; scannedOrganizations: number }> {
    const limit = params?.limit ?? 100
    const organizationIds = params?.organizationId
      ? [params.organizationId]
      : await db
          .from('organizations')
          .select('id')
          .then((rows) => rows.map((row) => row.id as string))

    let recovered = 0
    let remaining = limit

    for (const organizationId of organizationIds) {
      if (remaining <= 0) break

      const expired = await runWithTenant(organizationId, () =>
        this.sessions.listExpired({ organizationId, limit: remaining })
      )

      for (const session of expired) {
        await runWithTenant(organizationId, () => this.applyExpiry(session, { notify: true }))
        recovered += 1
        remaining -= 1
        if (remaining <= 0) break
      }
    }

    return { recovered, scannedOrganizations: organizationIds.length }
  }

  async purgeOldLogs(params?: {
    organizationId?: string
    limit?: number
    retentionDays?: number
  }): Promise<{ deleted: number; scannedOrganizations: number }> {
    const limit = params?.limit ?? 500
    const days = params?.retentionDays ?? FLOW_EXECUTION_LOG_RETENTION_DAYS
    const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const organizationIds = params?.organizationId
      ? [params.organizationId]
      : await db
          .from('organizations')
          .select('id')
          .then((rows) => rows.map((row) => row.id as string))

    let deleted = 0
    let remaining = limit

    for (const organizationId of organizationIds) {
      if (remaining <= 0) break
      const count = await runWithTenant(organizationId, () =>
        this.logs.deleteOlderThan({ organizationId, before, limit: remaining })
      )
      deleted += count
      remaining -= count
    }

    return { deleted, scannedOrganizations: organizationIds.length }
  }

  async #settingsFor(session: FlowSessionRow): Promise<FlowSettings> {
    const flow = await this.flows.findByIdForOrg({
      organizationId: session.organizationId,
      id: session.flowId,
    })
    return parseFlowSettings(flow?.settings)
  }

  async #terminateExpired(session: FlowSessionRow, settings: FlowSettings): Promise<void> {
    const updated = await this.sessions.update({
      organizationId: session.organizationId,
      id: session.id,
      status: FlowSessionStatus.TERMINATED,
      lastInteractionAt: new Date(),
      expiresAt: nextExpiresAt(settings),
    })
    if (!updated) return

    await this.logs.insert({
      organizationId: session.organizationId,
      flowSessionId: session.id,
      conversationId: session.conversationId,
      nodeId: session.currentNodeId,
      nodeType: 'SESSION',
      actionTaken: 'EXPIRY_RESTART',
    })
  }

  async #sendExpiryPrompt(session: FlowSessionRow): Promise<void> {
    const version = await this.flows.findVersionById({
      organizationId: session.organizationId,
      id: session.flowVersionId,
    })
    const graph = version
      ? parseFlowGraph({
          nodes: version.nodes,
          edges: version.edges,
          viewport: version.viewport,
        })
      : null
    const node = graph?.nodes.find((item) => item.id === session.currentNodeId)
    const hint = node ? repromptTextFor(node) : 'Please continue from the previous step.'
    const text = `${FLOW_SESSION_EXPIRED_PROMPT_PREFIX}${hint}`
    const expiredMs = new Date(session.expiresAt).getTime()

    try {
      await this.outbound.sendSystemText({
        organizationId: session.organizationId,
        conversationId: session.conversationId,
        sessionId: session.id,
        text,
        idempotencyKey: `flow:${session.id}:expiry:${expiredMs}`,
      })
    } catch (error) {
      logger.error({ err: error, sessionId: session.id }, 'flow.expiry.prompt_failed')
    }
  }
}
