import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { AiUsageDecision } from '#enums/ai_usage_decision'
import { ConversationAiMode } from '#enums/conversation_ai_mode'
import { AiUsageLogRepository } from '#repositories/ai_usage_log_repository'
import { ConversationAiRepository } from '#repositories/conversation_ai_repository'
import AiConversationSummaryService from '#services/ai/ai_conversation_summary_service'
import AiDebounceService from '#services/ai/ai_debounce_service'
import { MemoryWorkingSetService } from '#services/ai/contracts/memory_working_set_service'
import type { InboxAiSseEvent } from '#services/ai/contracts/inbox_ai_sse'
import type { DebounceTurnJobPayload } from '#services/ai/contracts/ai_job_payloads'
import type { MemoryTurn } from '#services/ai/contracts/memory_working_set_service'
import { LlmProvider } from '#services/ai/contracts/llm_provider'
import { publishInboxAiEvent } from '#services/ai/publish_inbox_ai_sse'
import KnowledgeRetrievalService from '#services/ai/knowledge_retrieval_service'
import { matchHandoverKeyword } from '#services/ai/match_handover_keywords'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import WhatsappOutboundException from '#exceptions/whatsapp_outbound_exception'
import WhatsappOutboundService from '#services/whatsapp_outbound_service'
import { runWithTenant } from '#services/tenant_context'

export const DEFAULT_AI_SYSTEM_PROMPT =
  'You are a helpful WhatsApp assistant. Answer only from the retrieved context. If the context is not enough, say you will connect the customer to a teammate.'

export type DebounceTurnResult = {
  outcome: 'skipped' | 'auto_replied' | 'handover'
  decision?: AiUsageDecision
  reason?: string
}

export default class AiDebounceTurnService {
  constructor(
    private debounce: AiDebounceService = new AiDebounceService(),
    private conversations: ConversationAiRepository = new ConversationAiRepository(),
    private usage: AiUsageLogRepository = new AiUsageLogRepository(),
    private retrieval: KnowledgeRetrievalService = new KnowledgeRetrievalService(),
    private platform: PlatformAiConfigService = new PlatformAiConfigService(),
    private outbound: WhatsappOutboundService = new WhatsappOutboundService(),
    private llm?: LlmProvider,
    private memory?: MemoryWorkingSetService,
    private publishAi: (
      organizationId: string,
      event: InboxAiSseEvent
    ) => void = publishInboxAiEvent,
    private summary: AiConversationSummaryService = new AiConversationSummaryService()
  ) {}

  async process(payload: DebounceTurnJobPayload): Promise<DebounceTurnResult> {
    return runWithTenant(payload.organizationId, () => this.#process(payload))
  }

  async #process(payload: DebounceTurnJobPayload): Promise<DebounceTurnResult> {
    const config = await this.platform.get()
    if (!config.isEnabled) return { outcome: 'skipped', reason: 'disabled' }

    const conversation = await this.conversations.findById({
      organizationId: payload.organizationId,
      conversationId: payload.conversationId,
    })
    if (!conversation || conversation.aiMode !== ConversationAiMode.AI_AUTO) {
      return { outcome: 'skipped', reason: 'not_ai_auto' }
    }

    const buffered = await this.debounce.drainBufferedMessages(
      payload.organizationId,
      payload.conversationId
    )
    const messages = buffered.length > 0 ? buffered : payload.aggregatedMessages
    if (messages.length === 0) return { outcome: 'skipped', reason: 'empty_buffer' }

    const userText = messages.map((item) => item.content).join('\n')
    const lastInboundId = messages[messages.length - 1]?.messageId ?? null

    const keyword = matchHandoverKeyword(userText, config.handoverKeywords)
    if (keyword) {
      await this.#handover(payload, {
        decision: AiUsageDecision.HANDOVER_KEYWORD,
        reason: keyword,
        messageId: lastInboundId,
        modelName: config.modelName,
      })
      return { outcome: 'handover', decision: AiUsageDecision.HANDOVER_KEYWORD, reason: keyword }
    }

    const retrieved = await this.retrieval.retrieve({
      organizationId: payload.organizationId,
      query: userText,
      campaignId: conversation.attributedCampaignId,
    })

    if (!retrieved.meetsMinConfidence) {
      await this.#handover(payload, {
        decision: AiUsageDecision.HANDOVER_LOW_CONFIDENCE,
        reason: 'low_confidence',
        messageId: lastInboundId,
        modelName: config.modelName,
        retrievalScore: retrieved.maxScore,
      })
      return {
        outcome: 'handover',
        decision: AiUsageDecision.HANDOVER_LOW_CONFIDENCE,
        reason: 'low_confidence',
      }
    }

    try {
      if (!this.llm) await this.platform.assertLlmReady()
      const llm = await this.#llm()
      const turns = await this.#recentTurns(payload.organizationId, payload.conversationId)
      const options = {
        model: config.modelName,
        temperature: config.temperature,
        systemPrompt: config.systemPrompt?.trim() || DEFAULT_AI_SYSTEM_PROMPT,
        userPrompt: buildUserPrompt({
          turns,
          summary: conversation.aiSummary,
          campaignName: retrieved.campaign?.name ?? null,
          userText,
        }),
        contextChunks: retrieved.chunks.map((chunk) => ({
          content: chunk.content,
          score: chunk.score,
        })),
      }
      this.publishAi(payload.organizationId, {
        type: 'ai.generation.started',
        data: { conversationId: payload.conversationId, promptAt: new Date().toISOString() },
      })
      const completion = await this.#streamCompletion(payload, llm, options)

      const queued = await this.outbound.queueText({
        organizationId: payload.organizationId,
        conversationId: payload.conversationId,
        text: completion.text,
        senderType: 'ai',
      })

      await this.usage.insert({
        organizationId: payload.organizationId,
        conversationId: payload.conversationId,
        messageId: queued.messageId,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.totalTokens,
        modelName: completion.modelName,
        latencyMs: completion.latencyMs,
        decision: AiUsageDecision.AUTO_REPLIED,
        retrievalScore: retrieved.maxScore,
      })

      this.publishAi(payload.organizationId, {
        type: 'ai.generation.completed',
        data: {
          conversationId: payload.conversationId,
          fullText: completion.text,
          latencyMs: completion.latencyMs,
          usage: {
            promptTokens: completion.promptTokens,
            completionTokens: completion.completionTokens,
            totalTokens: completion.totalTokens,
          },
        },
      })

      try {
        await this.summary.scheduleAfterAutoReply({
          organizationId: payload.organizationId,
          conversationId: payload.conversationId,
        })
      } catch (error) {
        logger.warn(
          {
            organizationId: payload.organizationId,
            conversationId: payload.conversationId,
            err: error instanceof Error ? error.message : 'unknown',
          },
          'ai.summarize.schedule_failed'
        )
      }

      return { outcome: 'auto_replied', decision: AiUsageDecision.AUTO_REPLIED }
    } catch (error) {
      logger.warn(
        {
          organizationId: payload.organizationId,
          conversationId: payload.conversationId,
          err: error instanceof Error ? error.message : 'unknown',
          code: error instanceof WhatsappOutboundException ? error.code : undefined,
        },
        'ai.debounce_turn.failed'
      )
      await this.#handover(payload, {
        decision: AiUsageDecision.HANDOVER_ERROR,
        reason: error instanceof Error ? error.message : 'unknown',
        messageId: lastInboundId,
        modelName: config.modelName,
        retrievalScore: retrieved.maxScore,
      })
      return {
        outcome: 'handover',
        decision: AiUsageDecision.HANDOVER_ERROR,
        reason: 'error',
      }
    }
  }

  async #handover(
    payload: DebounceTurnJobPayload,
    params: {
      decision: AiUsageDecision
      reason: string
      messageId: string | null
      modelName: string
      retrievalScore?: number
    }
  ): Promise<void> {
    await this.conversations.stampHandover({
      organizationId: payload.organizationId,
      conversationId: payload.conversationId,
      reason: params.reason,
    })
    await this.usage.insert({
      organizationId: payload.organizationId,
      conversationId: payload.conversationId,
      messageId: params.messageId,
      modelName: params.modelName,
      latencyMs: 0,
      decision: params.decision,
      retrievalScore: params.retrievalScore ?? null,
    })
    this.publishAi(payload.organizationId, handoverSseEvent(payload.conversationId, params))
  }

  async #streamCompletion(
    payload: DebounceTurnJobPayload,
    llm: LlmProvider,
    options: {
      model: string
      temperature: number
      systemPrompt: string
      userPrompt: string
      contextChunks: Array<{ content: string; score: number }>
    }
  ) {
    const stream = llm.streamCompletion(options)
    let next = await stream.next()
    while (!next.done) {
      const chunk = next.value
      this.publishAi(payload.organizationId, {
        type: 'ai.token.delta',
        data: {
          conversationId: payload.conversationId,
          delta: chunk.delta,
          chunkIndex: chunk.chunkIndex,
        },
      })
      next = await stream.next()
    }
    return next.value
  }

  async #recentTurns(organizationId: string, conversationId: string): Promise<MemoryTurn[]> {
    const memory = this.memory ?? (await app.container.make(MemoryWorkingSetService))
    return memory.getRecentTurns(organizationId, conversationId)
  }

  async #llm(): Promise<LlmProvider> {
    if (this.llm) return this.llm
    return app.container.make(LlmProvider)
  }
}

function buildUserPrompt(params: {
  turns: MemoryTurn[]
  summary: string | null
  campaignName: string | null
  userText: string
}): string {
  const lines: string[] = []
  const summary = params.summary?.trim()
  if (summary) {
    lines.push('Conversation summary:')
    lines.push(summary)
    lines.push('')
  }
  if (params.turns.length > 0) {
    lines.push('Recent conversation:')
    for (const turn of params.turns) {
      lines.push(`${turn.role}: ${turn.content}`)
    }
    lines.push('')
  }
  if (params.campaignName) {
    lines.push(`Campaign: ${params.campaignName}`)
  }
  lines.push('New messages:')
  lines.push(params.userText)
  return lines.join('\n')
}

function handoverSseEvent(
  conversationId: string,
  params: { decision: AiUsageDecision; reason: string; retrievalScore?: number }
): InboxAiSseEvent {
  if (params.decision === AiUsageDecision.HANDOVER_KEYWORD) {
    return {
      type: 'ai.handover.triggered',
      data: { conversationId, reason: 'keyword_match', matchedKeyword: params.reason },
    }
  }
  if (params.decision === AiUsageDecision.HANDOVER_LOW_CONFIDENCE) {
    return {
      type: 'ai.handover.triggered',
      data: {
        conversationId,
        reason: 'low_confidence',
        score: params.retrievalScore,
      },
    }
  }
  return {
    type: 'ai.handover.triggered',
    data: { conversationId, reason: 'business_exception' },
  }
}
