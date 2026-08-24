import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { FlowNodeType } from '#enums/flow_node_type'
import { asString, type FlowNode, type FlowTangentResumeMode } from '#lib/flow/flow_graph'
import { ConversationAiRepository } from '#repositories/conversation_ai_repository'
import { DEFAULT_AI_SYSTEM_PROMPT } from '#services/ai/ai_debounce_turn_service'
import { ChatLlmProvider } from '#services/ai/contracts/llm_provider'
import KnowledgeRetrievalService, {
  type KnowledgeRetrievalResult,
  type RetrievedKnowledgeChunk,
} from '#services/ai/knowledge_retrieval_service'
import { matchHandoverKeyword } from '#services/ai/match_handover_keywords'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import FlowOutboundAdapter from '#services/flow/flow_outbound_adapter'

export type FlowAiTangentAction = 'RESUMED_WITH_RAG' | 'ANSWERED_HOLD' | 'HANDOVER' | 'NOT_HANDLED'

export type FlowAiTangentResult = {
  handled: boolean
  action: FlowAiTangentAction
  reason?: string
}

export type FlowAiKnowledgeResult = {
  kind: 'answered' | 'low_confidence' | 'error'
  text?: string
  maxScore?: number
  reason?: string
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
    private llm?: ChatLlmProvider
  ) {}

  async handleUnexpectedInput(params: {
    organizationId: string
    conversationId: string
    sessionId: string
    messageId: string
    userText: string
    currentNode: FlowNode
    tangentResume: FlowTangentResumeMode
    minConfidenceScore?: number
    /** When true, low RAG confidence hands over instead of falling through. */
    fallbackToHandover?: boolean
  }): Promise<FlowAiTangentResult> {
    const userText = params.userText.trim()
    if (!userText) return { handled: false, action: 'NOT_HANDLED' }

    const config = await this.platform.get()
    const keyword = matchHandoverKeyword(userText, config.handoverKeywords)
    if (keyword) {
      await this.triggerHandover({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        reason: keyword,
      })
      return { handled: true, action: 'HANDOVER', reason: keyword }
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
      })
      return { handled: true, action: 'HANDOVER', reason: 'low_confidence' }
    }

    const ragAnswer = await this.#generateGroundedAnswer({
      systemPrompt: config.systemPrompt,
      chatModel: config.chatModel,
      temperature: config.temperature,
      maxTokens: config.maxOutputTokens,
      userText,
      chunks: retrieved.chunks,
    })
    if (!ragAnswer) {
      return { handled: false, action: 'NOT_HANDLED', reason: 'generation_failed' }
    }

    const immediate = params.tangentResume !== 'WAIT_FOR_NEXT'
    const text = immediate
      ? `${ragAnswer}\n\nTo continue: ${repromptTextFor(params.currentNode)}`
      : ragAnswer

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

    return {
      handled: true,
      action: immediate ? 'RESUMED_WITH_RAG' : 'ANSWERED_HOLD',
    }
  }

  async answerFromKnowledge(params: {
    organizationId: string
    query: string
    systemPromptOverride?: string | null
    minConfidenceScore?: number
  }): Promise<FlowAiKnowledgeResult> {
    const query = params.query.trim()
    if (!query) return { kind: 'low_confidence', maxScore: 0, reason: 'empty_query' }

    const config = await this.platform.get()
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
      return { kind: 'low_confidence', maxScore: retrieved.maxScore, reason: 'low_confidence' }
    }

    const text = await this.#generateGroundedAnswer({
      systemPrompt: params.systemPromptOverride?.trim() || config.systemPrompt,
      chatModel: config.chatModel,
      temperature: config.temperature,
      maxTokens: config.maxOutputTokens,
      userText: query,
      chunks: retrieved.chunks,
    })
    if (!text) return { kind: 'error', reason: 'generation_failed' }
    return { kind: 'answered', text, maxScore: retrieved.maxScore }
  }

  async triggerHandover(params: {
    organizationId: string
    conversationId: string
    reason: string
  }): Promise<void> {
    await this.conversations.stampHandover({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      reason: params.reason,
    })
  }

  async #generateGroundedAnswer(params: {
    systemPrompt: string | null
    chatModel: string
    temperature: number
    maxTokens: number
    userText: string
    chunks: RetrievedKnowledgeChunk[]
  }): Promise<string | null> {
    try {
      const llm = this.llm ?? (await app.container.make(ChatLlmProvider))
      const completion = await llm.generateCompletion({
        model: params.chatModel,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        systemPrompt: params.systemPrompt?.trim() || DEFAULT_AI_SYSTEM_PROMPT,
        userPrompt: params.userText,
        contextChunks: params.chunks.map((chunk) => ({
          content: chunk.content,
          score: chunk.score,
        })),
      })
      const text = completion.text.trim()
      return text || null
    } catch (error) {
      logger.error({ err: error }, 'flow.ai.generate_failed')
      return null
    }
  }
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
