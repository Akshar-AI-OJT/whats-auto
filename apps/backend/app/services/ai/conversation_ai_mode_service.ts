import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { ConversationAiMode } from '#enums/conversation_ai_mode'
import ConversationException from '#exceptions/conversation_exception'
import {
  ConversationAiRepository,
  type ConversationAiState,
} from '#repositories/conversation_ai_repository'
import { FlowSessionRepository } from '#repositories/flow_session_repository'
import { canTransitionAiMode } from '#services/ai/conversation_ai_transitions'
import { publishConversationAiModeUpdated } from '#services/ai/publish_conversation_ai_mode_sse'
import FlowInboundBufferService from '#services/flow/flow_inbound_buffer_service'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { runWithTenant } from '#services/tenant_context'

export default class ConversationAiModeService {
  constructor(
    private conversations: ConversationAiRepository = new ConversationAiRepository(),
    private sessions: FlowSessionRepository = new FlowSessionRepository(),
    private inboundBuffer: FlowInboundBufferService = new FlowInboundBufferService(),
    private queue?: JobQueueManager
  ) {}

  async takeover(params: {
    organizationId: string
    conversationId: string
  }): Promise<ConversationAiState> {
    const state = await this.#move(params, {
      to: ConversationAiMode.HUMAN_ACTIVE,
      reason: 'takeover',
    })
    await this.#publishModeUpdated(params)
    return state
  }

  async resume(params: {
    organizationId: string
    conversationId: string
  }): Promise<ConversationAiState> {
    const state = await this.#move(params, {
      to: ConversationAiMode.AI_AUTO,
      reason: null,
    })
    await this.#publishModeUpdated(params)
    return state
  }

  async onAgentReply(params: { organizationId: string; conversationId: string }): Promise<void> {
    const state = await runWithTenant(params.organizationId, () =>
      this.conversations.findById(params)
    )
    if (!state || state.aiMode === ConversationAiMode.HUMAN_ACTIVE) {
      await this.#pauseFlowSessions(params)
      await this.#cancelPendingFlowAdvance(params)
      await this.#publishModeUpdated(params)
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
    await this.#pauseFlowSessions(params)
    await this.#cancelPendingFlowAdvance(params)
    await this.#publishModeUpdated(params)
  }

  async #move(
    params: { organizationId: string; conversationId: string },
    next: { to: ConversationAiMode; reason: string | null }
  ): Promise<ConversationAiState> {
    const state = await runWithTenant(params.organizationId, () =>
      this.conversations.findById(params)
    )
    if (!state) throw ConversationException.notFound()
    if (state.aiMode === next.to) {
      if (next.to === ConversationAiMode.HUMAN_ACTIVE) {
        await this.#pauseFlowSessions(params)
        await this.#cancelPendingFlowAdvance(params)
      }
      if (next.to === ConversationAiMode.AI_AUTO) {
        await this.#terminatePausedFlowSessions(params)
        await this.inboundBuffer.cancel(params)
      }
      return state
    }
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
    if (next.to === ConversationAiMode.HUMAN_ACTIVE) {
      await this.#pauseFlowSessions(params)
      await this.#cancelPendingFlowAdvance(params)
    }
    if (next.to === ConversationAiMode.AI_AUTO) {
      await this.#terminatePausedFlowSessions(params)
      // Drop stale coalesced text so resume does not merge a prior burst.
      await this.inboundBuffer.cancel(params)
    }

    const updated = await runWithTenant(params.organizationId, () =>
      this.conversations.findById(params)
    )
    return updated ?? { ...state, aiMode: next.to, aiHandoverReason: next.reason }
  }

  async #publishModeUpdated(params: {
    organizationId: string
    conversationId: string
  }): Promise<void> {
    try {
      await publishConversationAiModeUpdated({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        conversations: this.conversations,
        sessions: this.sessions,
      })
    } catch (error) {
      logger.warn(
        {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'conversation.ai_mode.sse_failed'
      )
    }
  }

  async #pauseFlowSessions(params: {
    organizationId: string
    conversationId: string
  }): Promise<void> {
    await runWithTenant(params.organizationId, () =>
      this.sessions.pauseActiveForConversation(params)
    )
  }

  async #terminatePausedFlowSessions(params: {
    organizationId: string
    conversationId: string
  }): Promise<void> {
    await runWithTenant(params.organizationId, () =>
      this.sessions.terminatePausedForConversation(params)
    )
  }

  async #cancelPendingFlowAdvance(params: {
    organizationId: string
    conversationId: string
  }): Promise<void> {
    await this.inboundBuffer.cancel(params)
    try {
      const manager = this.queue ?? (await app.container.make(JobQueueManager))
      const driver = await manager.ensureStarted()
      await driver.remove?.(JOB_NAMES.FLOWS_ADVANCE_SESSION, params.conversationId)
    } catch (error) {
      logger.warn(
        {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'flow.advance.cancel_job_failed'
      )
    }
  }
}
