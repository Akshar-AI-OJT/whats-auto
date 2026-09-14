import { ConversationAiRepository } from '#repositories/conversation_ai_repository'
import { FlowSessionRepository } from '#repositories/flow_session_repository'
import { deriveAutomationVisibility } from '#services/ai/automation_visibility'
import type { InboxAiSseEvent } from '#services/ai/contracts/inbox_ai_sse'
import { publishInboxAiEvent } from '#services/ai/publish_inbox_ai_sse'
import { runWithTenant } from '#services/tenant_context'

/**
 * Publish conversation.ai_mode.updated with derived automation visibility.
 */
export async function publishConversationAiModeUpdated(params: {
  organizationId: string
  conversationId: string
  conversations?: ConversationAiRepository
  sessions?: FlowSessionRepository
  publish?: (organizationId: string, event: InboxAiSseEvent) => void
}): Promise<void> {
  const conversations = params.conversations ?? new ConversationAiRepository()
  const sessions = params.sessions ?? new FlowSessionRepository()
  const publish = params.publish ?? publishInboxAiEvent

  const state = await runWithTenant(params.organizationId, () =>
    conversations.findById({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
    })
  )
  if (!state) return

  let openStatus: string | null = null
  try {
    const open = await runWithTenant(params.organizationId, () =>
      sessions.findOpenForConversation({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
      })
    )
    openStatus = open?.status ?? null
  } catch {
    openStatus = null
  }

  const visibility = deriveAutomationVisibility(state.aiMode, openStatus)

  try {
    publish(params.organizationId, {
      type: 'conversation.ai_mode.updated',
      data: {
        conversationId: params.conversationId,
        aiMode: state.aiMode,
        aiHandoverReason: state.aiHandoverReason,
        automationBlocked: visibility.automationBlocked,
        openFlowSessionStatus: visibility.openFlowSessionStatus,
      },
    })
  } catch {
    // SSE must not fail takeover/resume/handover.
  }
}
