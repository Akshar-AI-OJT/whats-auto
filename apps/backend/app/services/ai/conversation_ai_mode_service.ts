import { ConversationAiMode } from '#enums/conversation_ai_mode'
import ConversationException from '#exceptions/conversation_exception'
import {
  ConversationAiRepository,
  type ConversationAiState,
} from '#repositories/conversation_ai_repository'
import AiDebounceService from '#services/ai/ai_debounce_service'
import { canTransitionAiMode } from '#services/ai/conversation_ai_transitions'
import { runWithTenant } from '#services/tenant_context'

export default class ConversationAiModeService {
  constructor(
    private conversations: ConversationAiRepository = new ConversationAiRepository(),
    private debounce: AiDebounceService = new AiDebounceService()
  ) {}

  async takeover(params: {
    organizationId: string
    conversationId: string
  }): Promise<ConversationAiState> {
    return this.#move(params, {
      to: ConversationAiMode.HUMAN_ACTIVE,
      reason: 'takeover',
      cancelDebounce: true,
    })
  }

  async resume(params: {
    organizationId: string
    conversationId: string
  }): Promise<ConversationAiState> {
    return this.#move(params, {
      to: ConversationAiMode.AI_AUTO,
      reason: null,
      cancelDebounce: true,
    })
  }

  async onAgentReply(params: { organizationId: string; conversationId: string }): Promise<void> {
    const state = await runWithTenant(params.organizationId, () =>
      this.conversations.findById(params)
    )
    if (!state || state.aiMode === ConversationAiMode.HUMAN_ACTIVE) {
      await this.debounce.cancelPending(params.organizationId, params.conversationId)
      return
    }
    if (!canTransitionAiMode(state.aiMode, ConversationAiMode.HUMAN_ACTIVE)) return

    await runWithTenant(params.organizationId, () =>
      this.conversations.updateAiMode({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        from: [state.aiMode],
        to: ConversationAiMode.HUMAN_ACTIVE,
        handoverReason: 'agent_reply',
      })
    )
    await this.debounce.cancelPending(params.organizationId, params.conversationId)
  }

  async #move(
    params: { organizationId: string; conversationId: string },
    next: { to: ConversationAiMode; reason: string | null; cancelDebounce: boolean }
  ): Promise<ConversationAiState> {
    const state = await runWithTenant(params.organizationId, () =>
      this.conversations.findById(params)
    )
    if (!state) throw ConversationException.notFound()
    if (state.aiMode === next.to) return state
    if (!canTransitionAiMode(state.aiMode, next.to)) {
      throw ConversationException.invalidAiTransition()
    }

    await runWithTenant(params.organizationId, () =>
      this.conversations.updateAiMode({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        from: [state.aiMode],
        to: next.to,
        handoverReason: next.reason,
      })
    )
    if (next.cancelDebounce) {
      await this.debounce.cancelPending(params.organizationId, params.conversationId)
    }

    const updated = await runWithTenant(params.organizationId, () =>
      this.conversations.findById(params)
    )
    return updated ?? { ...state, aiMode: next.to, aiHandoverReason: next.reason }
  }
}
