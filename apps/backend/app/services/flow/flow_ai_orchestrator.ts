import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { AiUsageDecision } from '#enums/ai_usage_decision'
import { FlowNodeType } from '#enums/flow_node_type'
import { asString, type FlowNode, type FlowTangentResumeMode } from '#lib/flow/flow_graph'
import { AiUsageLogRepository } from '#repositories/ai_usage_log_repository'
import { ConversationAiRepository } from '#repositories/conversation_ai_repository'
import AiAnswerCacheService from '#services/ai/ai_answer_cache_service'
import AiConversationSummaryService from '#services/ai/ai_conversation_summary_service'
import { composeRagSystemPrompt, ragPromptFingerprint } from '#services/ai/ai_prompt_defaults'
import type { InboxAiSseEvent } from '#services/ai/contracts/inbox_ai_sse'
import { ChatLlmProvider } from '#services/ai/contracts/llm_provider'
import { handoverSseEvent } from '#services/ai/handover_sse_event'
import KnowledgeRetrievalService, {
  type KnowledgeRetrievalResult,
  type RetrievedKnowledgeChunk,
} from '#services/ai/knowledge_retrieval_service'
import { matchHandoverKeyword } from '#services/ai/match_handover_keywords'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import { publishInboxAiEvent } from '#services/ai/publish_inbox_ai_sse'
import { publishConversationAiModeUpdated } from '#services/ai/publish_conversation_ai_mode_sse'
import FlowOutboundAdapter from '#services/flow/flow_outbound_adapter'
import { runWithTenant } from '#services/tenant_context'

export type FlowAiTangentAction = 'RESUMED_WITH_RAG' | 'ANSWERED_HOLD' | 'HANDOVER' | 'NOT_HANDLED'

export type FlowAiTangentResult = {
  handled: boolean
  action: FlowAiTangentAction
  reason?: string
}

export type FlowAiKnowledgeUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  modelName: string
  latencyMs: number
  retrievalScore: number | null
  fromCache: boolean
}

export type FlowAiKnowledgeResult = {
  kind: 'answered' | 'low_confidence' | 'error'
  text?: string
  maxScore?: number
  reason?: string
  usage?: FlowAiKnowledgeUsage
}

/**
 * RAG tangent (unmatched wait) plus grounded answers for AI_RAG nodes.
 */
export default class FlowAiOrchestrator {
  constructor(
    private retrieval: KnowledgeRetrievalService = new KnowledgeRetrievalService(),
    private platform: PlatformAiConfigService = new PlatformAiConfigService(),
    private conversations: ConversationAiRepository = new ConversationAiRepository(),
    private outbound: FlowOutboundAdapter = new FlowOutboundAdapter(),
    private usage: AiUsageLogRepository = new AiUsageLogRepository(),
    private answers: AiAnswerCacheService = new AiAnswerCacheService(),
    private summary: AiConversationSummaryService = new AiConversationSummaryService(),
    private llm?: ChatLlmProvider,
    private publishAi: (
      organizationId: string,
      event: InboxAiSseEvent
    ) => void = publishInboxAiEvent
  ) {}

  async handleUnexpectedInput(params: {
    organizationId: string
    conversationId: string
    sessionId: string
    messageId: string
    userText: string
    currentNode: FlowNode
    tangentResume: FlowTangentResumeMode
    /** Per-flow mid-session escape phrases (not platform config). */
    handoverKeywords: string[]
    minConfidenceScore?: number
    /** When true, low RAG confidence hands over instead of falling through. */
    fallbackToHandover?: boolean
  }): Promise<FlowAiTangentResult> {
    const userText = params.userText.trim()
    if (!userText) return { handled: false, action: 'NOT_HANDLED' }

    const config = await this.platform.get()
    const keyword = matchHandoverKeyword(userText, params.handoverKeywords)
    if (keyword) {
      await this.triggerHandover({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        reason: keyword,
        usage: {
          decision: AiUsageDecision.HANDOVER_KEYWORD,
          messageId: params.messageId,
          modelName: config.chatModel,
        },
      })
      return { handled: true, action: 'HANDOVER', reason: keyword }
    }

    if (!config.isEnabled) {
      return { handled: false, action: 'NOT_HANDLED', reason: 'ai_disabled' }
    }

    const retrieved = await this.retrieval.retrieve({
      organizationId: params.organizationId,
      query: userText,
    })
    const minScore = params.minConfidenceScore ?? config.minConfidenceScore
    const confident = retrieved.meetsMinConfidence && retrieved.maxScore >= minScore

    if (!confident) {
      if (!params.fallbackToHandover) {
        return { handled: false, action: 'NOT_HANDLED', reason: 'low_confidence' }
      }
      await this.triggerHandover({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        reason: 'low_confidence',
        usage: {
          decision: AiUsageDecision.HANDOVER_LOW_CONFIDENCE,
          messageId: params.messageId,
          modelName: config.chatModel,
          retrievalScore: retrieved.maxScore,
        },
      })
      return { handled: true, action: 'HANDOVER', reason: 'low_confidence' }
    }

    const conversation = await runWithTenant(params.organizationId, () =>
      this.conversations.findById({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
      })
    )

    const systemPrompt = composeRagSystemPrompt({
      platformPrompt: config.systemPrompt,
      orgAppendix: null,
    })

    const generation = await this.#generateGroundedAnswer({
      systemPrompt,
      chatModel: config.chatModel,
      temperature: config.temperature,
      maxTokens: config.maxOutputTokens,
      userText,
      summary: conversation?.aiSummary ?? null,
      chunks: retrieved.chunks,
    })
    if (!generation) {
      return { handled: false, action: 'NOT_HANDLED', reason: 'generation_failed' }
    }

    const immediate = params.tangentResume !== 'WAIT_FOR_NEXT'
    const text = immediate
      ? `${generation.text}\n\nTo continue: ${repromptTextFor(params.currentNode)}`
      : generation.text

    try {
      await this.outbound.sendAiText({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        sessionId: params.sessionId,
        text,
        idempotencyKey: `flow:${params.sessionId}:tangent:${params.messageId}`,
      })
    } catch (error) {
      logger.error({ err: error, sessionId: params.sessionId }, 'flow.tangent.send_failed')
      return { handled: false, action: 'NOT_HANDLED', reason: 'send_failed' }
    }

    await this.recordSuccessfulReply({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      messageId: params.messageId,
      modelName: generation.modelName,
      promptTokens: generation.promptTokens,
      completionTokens: generation.completionTokens,
      totalTokens: generation.totalTokens,
      latencyMs: generation.latencyMs,
      retrievalScore: retrieved.maxScore,
    })

    return {
      handled: true,
      action: immediate ? 'RESUMED_WITH_RAG' : 'ANSWERED_HOLD',
    }
  }

  async answerFromKnowledge(params: {
    organizationId: string
    conversationId: string
    query: string
    promptAppendix?: string | null
    minConfidenceScore?: number
  }): Promise<FlowAiKnowledgeResult> {
    const query = params.query.trim()
    if (!query) return { kind: 'low_confidence', maxScore: 0, reason: 'empty_query' }

    const config = await this.platform.get()
    if (!config.isEnabled) {
      return { kind: 'low_confidence', maxScore: 0, reason: 'ai_disabled' }
    }

    const systemPrompt = composeRagSystemPrompt({
      platformPrompt: config.systemPrompt,
      orgAppendix: params.promptAppendix,
    })
    const cacheLookup = {
      organizationId: params.organizationId,
      question: query,
      embeddingSpaceId: config.activeEmbeddingSpaceId,
      promptFingerprint: ragPromptFingerprint(systemPrompt),
    }

    const cached = await this.answers.get(cacheLookup)
    if (cached) {
      return {
        kind: 'answered',
        text: cached,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          modelName: config.chatModel,
          latencyMs: 0,
          retrievalScore: null,
          fromCache: true,
        },
      }
    }

    let retrieved: KnowledgeRetrievalResult
    try {
      retrieved = await this.retrieval.retrieve({
        organizationId: params.organizationId,
        query,
      })
    } catch (error) {
      logger.error({ err: error }, 'flow.ai_rag.retrieve_failed')
      return { kind: 'error', reason: 'retrieve_failed' }
    }

    const minScore = params.minConfidenceScore ?? config.minConfidenceScore
    if (!retrieved.meetsMinConfidence || retrieved.maxScore < minScore) {
      return {
        kind: 'low_confidence',
        maxScore: retrieved.maxScore,
        reason: 'low_confidence',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          modelName: config.chatModel,
          latencyMs: 0,
          retrievalScore: retrieved.maxScore,
          fromCache: false,
        },
      }
    }

    const conversation = await runWithTenant(params.organizationId, () =>
      this.conversations.findById({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
      })
    )

    const generation = await this.#generateGroundedAnswer({
      systemPrompt,
      chatModel: config.chatModel,
      temperature: config.temperature,
      maxTokens: config.maxOutputTokens,
      userText: query,
      summary: conversation?.aiSummary ?? null,
      chunks: retrieved.chunks,
    })
    if (!generation) return { kind: 'error', reason: 'generation_failed' }

    await this.answers.set(cacheLookup, generation.text)

    return {
      kind: 'answered',
      text: generation.text,
      maxScore: retrieved.maxScore,
      usage: {
        promptTokens: generation.promptTokens,
        completionTokens: generation.completionTokens,
        totalTokens: generation.totalTokens,
        modelName: generation.modelName,
        latencyMs: generation.latencyMs,
        retrievalScore: retrieved.maxScore,
        fromCache: false,
      },
    }
  }

  async triggerHandover(params: {
    organizationId: string
    conversationId: string
    reason: string
    usage?: {
      decision: AiUsageDecision
      messageId?: string | null
      modelName: string
      retrievalScore?: number | null
    }
  }): Promise<void> {
    await this.conversations.stampHandover({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      reason: params.reason,
    })

    this.publishAi(
      params.organizationId,
      handoverSseEvent({
        conversationId: params.conversationId,
        reason: params.reason,
        usage: params.usage,
      })
    )

    await publishConversationAiModeUpdated({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      conversations: this.conversations,
      publish: this.publishAi,
    })

    if (!params.usage) return
    try {
      await this.usage.insert({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        messageId: params.usage.messageId ?? null,
        modelName: params.usage.modelName,
        latencyMs: 0,
        decision: params.usage.decision,
        retrievalScore: params.usage.retrievalScore ?? null,
      })
    } catch (error) {
      logger.warn(
        {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'flow.ai.usage_log_failed'
      )
    }
  }

  /**
   * After a successful AI WhatsApp send: usage log + optional summary schedule.
   */
  async recordSuccessfulReply(params: {
    organizationId: string
    conversationId: string
    messageId?: string | null
    modelName: string
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
    latencyMs?: number
    retrievalScore?: number | null
  }): Promise<void> {
    try {
      await this.usage.insert({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        messageId: params.messageId ?? null,
        promptTokens: params.promptTokens ?? 0,
        completionTokens: params.completionTokens ?? 0,
        totalTokens: params.totalTokens ?? 0,
        modelName: params.modelName,
        latencyMs: params.latencyMs ?? 0,
        decision: AiUsageDecision.AUTO_REPLIED,
        retrievalScore: params.retrievalScore ?? null,
      })
    } catch (error) {
      logger.warn(
        {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'flow.ai.usage_log_failed'
      )
    }

    try {
      await this.summary.scheduleAfterAutoReply({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
      })
    } catch (error) {
      logger.warn(
        {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'flow.ai.summary_schedule_failed'
      )
    }
  }

  async #generateGroundedAnswer(params: {
    systemPrompt: string
    chatModel: string
    temperature: number
    maxTokens: number
    userText: string
    summary: string | null
    chunks: RetrievedKnowledgeChunk[]
  }): Promise<{
    text: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    modelName: string
    latencyMs: number
  } | null> {
    try {
      const llm = this.llm ?? (await app.container.make(ChatLlmProvider))
      const completion = await llm.generateCompletion({
        model: params.chatModel,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        systemPrompt: params.systemPrompt,
        userPrompt: buildRagUserPrompt({
          summary: params.summary,
          userText: params.userText,
        }),
        contextChunks: params.chunks.map((chunk) => ({
          content: chunk.content,
          score: chunk.score,
        })),
      })
      const text = completion.text.trim()
      if (!text) return null
      return {
        text,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.totalTokens,
        modelName: completion.modelName,
        latencyMs: completion.latencyMs,
      }
    } catch (error) {
      logger.error({ err: error }, 'flow.ai.generate_failed')
      return null
    }
  }
}

export function buildRagUserPrompt(params: { summary: string | null; userText: string }): string {
  const lines: string[] = []
  const summary = params.summary?.trim()
  if (summary) {
    lines.push('Conversation summary:')
    lines.push(summary)
    lines.push('')
  }
  lines.push(params.userText)
  return lines.join('\n')
}

export function repromptTextFor(node: FlowNode): string {
  if (node.type === FlowNodeType.MESSAGE) {
    return asString(node.data.text)?.trim() || 'Please provide the requested information.'
  }
  if (
    node.type === FlowNodeType.INTERACTIVE_BUTTON ||
    node.type === FlowNodeType.INTERACTIVE_LIST
  ) {
    return asString(node.data.bodyText)?.trim() || 'Please select an option from the menu above.'
  }
  return 'Please continue from the previous step.'
}
