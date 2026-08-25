import { test } from '@japa/runner'
import { AiUsageDecision } from '#enums/ai_usage_decision'
import { FlowNodeType } from '#enums/flow_node_type'
import type { AiUsageLogRepository } from '#repositories/ai_usage_log_repository'
import type { ConversationAiRepository } from '#repositories/conversation_ai_repository'
import type AiAnswerCacheService from '#services/ai/ai_answer_cache_service'
import type AiConversationSummaryService from '#services/ai/ai_conversation_summary_service'
import type { ChatLlmProvider } from '#services/ai/contracts/llm_provider'
import type KnowledgeRetrievalService from '#services/ai/knowledge_retrieval_service'
import type PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import FlowAiOrchestrator, {
  buildRagUserPrompt,
  repromptTextFor,
} from '#services/flow/flow_ai_orchestrator'
import type FlowOutboundAdapter from '#services/flow/flow_outbound_adapter'

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CONV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

test.group('flow AI orchestrator helpers', () => {
  test('repromptTextFor uses node copy', ({ assert }) => {
    assert.equal(
      repromptTextFor({
        id: 'ask',
        type: FlowNodeType.MESSAGE,
        data: { text: 'What is your order id?' },
      }),
      'What is your order id?'
    )
    assert.equal(
      repromptTextFor({
        id: 'menu',
        type: FlowNodeType.INTERACTIVE_BUTTON,
        data: { bodyText: 'Pick one' },
      }),
      'Pick one'
    )
  })

  test('buildRagUserPrompt includes summary when present', ({ assert }) => {
    assert.equal(
      buildRagUserPrompt({ summary: 'Customer asked about hours', userText: 'Open Sunday?' }),
      ['Conversation summary:', 'Customer asked about hours', '', 'Open Sunday?'].join('\n')
    )
    assert.equal(buildRagUserPrompt({ summary: null, userText: 'Hi' }), 'Hi')
  })
})

test.group('FlowAiOrchestrator.answerFromKnowledge', () => {
  test('returns cached answer without retrieve or LLM', async ({ assert }) => {
    const retrieved: unknown[] = []
    const generated: unknown[] = []
    const cachedSets: unknown[] = []

    const orchestrator = new FlowAiOrchestrator(
      {
        async retrieve(params: unknown) {
          retrieved.push(params)
          return { chunks: [], maxScore: 0, meetsMinConfidence: false }
        },
      } as unknown as KnowledgeRetrievalService,
      {
        async get() {
          return {
            isEnabled: true,
            systemPrompt: 'base',
            chatModel: 'gpt-test',
            temperature: 0.2,
            maxOutputTokens: 256,
            minConfidenceScore: 0.5,
            activeEmbeddingSpaceId: 'space:v1',
          }
        },
      } as unknown as PlatformAiConfigService,
      {
        async findById() {
          return { id: CONV, aiSummary: null }
        },
      } as unknown as ConversationAiRepository,
      {} as FlowOutboundAdapter,
      {} as AiUsageLogRepository,
      {
        async get() {
          return 'Cached hours reply'
        },
        async set(...args: unknown[]) {
          cachedSets.push(args)
        },
      } as unknown as AiAnswerCacheService,
      {} as AiConversationSummaryService,
      {
        async generateCompletion(params: unknown) {
          generated.push(params)
          return {
            text: 'fresh',
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
            modelName: 'gpt-test',
            latencyMs: 10,
          }
        },
      } as unknown as ChatLlmProvider
    )

    const result = await orchestrator.answerFromKnowledge({
      organizationId: ORG,
      conversationId: CONV,
      query: 'What are your hours?',
    })

    assert.equal(result.kind, 'answered')
    assert.equal(result.text, 'Cached hours reply')
    assert.isTrue(result.usage?.fromCache)
    assert.lengthOf(retrieved, 0)
    assert.lengthOf(generated, 0)
    assert.lengthOf(cachedSets, 0)
  })

  test('caches a generated answer and includes summary in the user prompt', async ({ assert }) => {
    const cachedSets: Array<{ question: string; text: string }> = []
    let userPrompt = ''

    const orchestrator = new FlowAiOrchestrator(
      {
        async retrieve() {
          return {
            chunks: [{ content: 'We open 9-5', score: 0.9, id: 'c1' }],
            maxScore: 0.9,
            meetsMinConfidence: true,
          }
        },
      } as unknown as KnowledgeRetrievalService,
      {
        async get() {
          return {
            isEnabled: true,
            systemPrompt: 'base',
            chatModel: 'gpt-test',
            temperature: 0.2,
            maxOutputTokens: 256,
            minConfidenceScore: 0.5,
            activeEmbeddingSpaceId: 'space:v1',
          }
        },
      } as unknown as PlatformAiConfigService,
      {
        async findById() {
          return { id: CONV, aiSummary: 'Prior chat about delivery' }
        },
      } as unknown as ConversationAiRepository,
      {} as FlowOutboundAdapter,
      {} as AiUsageLogRepository,
      {
        async get() {
          return null
        },
        async set(lookup: { question: string }, text: string) {
          cachedSets.push({ question: lookup.question, text })
        },
      } as unknown as AiAnswerCacheService,
      {} as AiConversationSummaryService,
      {
        async generateCompletion(params: { userPrompt: string }) {
          userPrompt = params.userPrompt
          return {
            text: 'We are open 9 to 5.',
            promptTokens: 12,
            completionTokens: 8,
            totalTokens: 20,
            modelName: 'gpt-test',
            latencyMs: 40,
          }
        },
      } as unknown as ChatLlmProvider
    )

    const result = await orchestrator.answerFromKnowledge({
      organizationId: ORG,
      conversationId: CONV,
      query: 'Hours?',
    })

    assert.equal(result.kind, 'answered')
    assert.equal(result.text, 'We are open 9 to 5.')
    assert.isFalse(result.usage?.fromCache)
    assert.equal(result.usage?.totalTokens, 20)
    assert.include(userPrompt, 'Prior chat about delivery')
    assert.include(userPrompt, 'Hours?')
    assert.deepEqual(cachedSets, [{ question: 'Hours?', text: 'We are open 9 to 5.' }])
  })

  test('passes promptFingerprint so different appendices do not share cache entries', async ({
    assert,
  }) => {
    const lookups: Array<{ promptFingerprint?: string }> = []

    const orchestrator = new FlowAiOrchestrator(
      {
        async retrieve() {
          return { chunks: [], maxScore: 0, meetsMinConfidence: false }
        },
      } as unknown as KnowledgeRetrievalService,
      {
        async get() {
          return {
            isEnabled: true,
            systemPrompt: 'base',
            chatModel: 'gpt-test',
            temperature: 0.2,
            maxOutputTokens: 256,
            minConfidenceScore: 0.5,
            activeEmbeddingSpaceId: 'space:v1',
          }
        },
      } as unknown as PlatformAiConfigService,
      {
        async findById() {
          return { id: CONV, aiSummary: null }
        },
      } as unknown as ConversationAiRepository,
      {} as FlowOutboundAdapter,
      {} as AiUsageLogRepository,
      {
        async get(lookup: { promptFingerprint?: string }) {
          lookups.push(lookup)
          return null
        },
        async set() {},
      } as unknown as AiAnswerCacheService,
      {} as AiConversationSummaryService,
      {
        async generateCompletion() {
          return {
            text: 'x',
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
            modelName: 'gpt-test',
            latencyMs: 1,
          }
        },
      } as unknown as ChatLlmProvider
    )

    await orchestrator.answerFromKnowledge({
      organizationId: ORG,
      conversationId: CONV,
      query: 'Hours?',
      promptAppendix: 'Be brief',
    })
    await orchestrator.answerFromKnowledge({
      organizationId: ORG,
      conversationId: CONV,
      query: 'Hours?',
      promptAppendix: 'Be formal',
    })

    assert.lengthOf(lookups, 2)
    assert.isString(lookups[0].promptFingerprint)
    assert.isString(lookups[1].promptFingerprint)
    assert.notEqual(lookups[0].promptFingerprint, lookups[1].promptFingerprint)
  })

  test('returns ai_disabled without cache, retrieve, or LLM when platform AI is off', async ({
    assert,
  }) => {
    const retrieved: unknown[] = []
    const cacheGets: unknown[] = []
    const generated: unknown[] = []

    const orchestrator = new FlowAiOrchestrator(
      {
        async retrieve(params: unknown) {
          retrieved.push(params)
          return { chunks: [], maxScore: 0, meetsMinConfidence: false }
        },
      } as unknown as KnowledgeRetrievalService,
      {
        async get() {
          return {
            isEnabled: false,
            systemPrompt: 'base',
            chatModel: 'gpt-test',
            temperature: 0.2,
            maxOutputTokens: 256,
            minConfidenceScore: 0.5,
            activeEmbeddingSpaceId: 'space:v1',
          }
        },
      } as unknown as PlatformAiConfigService,
      {} as ConversationAiRepository,
      {} as FlowOutboundAdapter,
      {} as AiUsageLogRepository,
      {
        async get(lookup: unknown) {
          cacheGets.push(lookup)
          return 'should not be used'
        },
        async set() {},
      } as unknown as AiAnswerCacheService,
      {} as AiConversationSummaryService,
      {
        async generateCompletion(params: unknown) {
          generated.push(params)
          return {
            text: 'fresh',
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
            modelName: 'gpt-test',
            latencyMs: 1,
          }
        },
      } as unknown as ChatLlmProvider
    )

    const result = await orchestrator.answerFromKnowledge({
      organizationId: ORG,
      conversationId: CONV,
      query: 'What are your hours?',
    })

    assert.deepEqual(result, {
      kind: 'low_confidence',
      maxScore: 0,
      reason: 'ai_disabled',
    })
    assert.lengthOf(cacheGets, 0)
    assert.lengthOf(retrieved, 0)
    assert.lengthOf(generated, 0)
  })
})

test.group('FlowAiOrchestrator.handleUnexpectedInput', () => {
  const SESSION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const MESSAGE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const currentNode = {
    id: 'ask',
    type: FlowNodeType.MESSAGE,
    data: { text: 'Order id?' },
  }

  test('returns NOT_HANDLED with ai_disabled and skips retrieve when AI is off', async ({
    assert,
  }) => {
    const retrieved: unknown[] = []

    const orchestrator = new FlowAiOrchestrator(
      {
        async retrieve(params: unknown) {
          retrieved.push(params)
          return { chunks: [], maxScore: 0, meetsMinConfidence: false }
        },
      } as unknown as KnowledgeRetrievalService,
      {
        async get() {
          return {
            isEnabled: false,
            handoverKeywords: ['agent'],
            systemPrompt: 'base',
            chatModel: 'gpt-test',
            temperature: 0.2,
            maxOutputTokens: 256,
            minConfidenceScore: 0.5,
            activeEmbeddingSpaceId: 'space:v1',
          }
        },
      } as unknown as PlatformAiConfigService,
      {} as ConversationAiRepository,
      {} as FlowOutboundAdapter,
      {} as AiUsageLogRepository,
      {} as AiAnswerCacheService,
      {} as AiConversationSummaryService
    )

    const result = await orchestrator.handleUnexpectedInput({
      organizationId: ORG,
      conversationId: CONV,
      sessionId: SESSION,
      messageId: MESSAGE,
      userText: 'What are your hours?',
      currentNode,
      tangentResume: 'IMMEDIATE_REPROMPT',
      handoverKeywords: ['agent'],
    })

    assert.deepEqual(result, {
      handled: false,
      action: 'NOT_HANDLED',
      reason: 'ai_disabled',
    })
    assert.lengthOf(retrieved, 0)
  })

  test('hands over on per-flow keyword match without retrieve', async ({ assert }) => {
    const retrieved: unknown[] = []
    const stamps: unknown[] = []
    const usageRows: unknown[] = []
    const sse: unknown[] = []

    const orchestrator = new FlowAiOrchestrator(
      {
        async retrieve(params: unknown) {
          retrieved.push(params)
          return { chunks: [], maxScore: 0, meetsMinConfidence: false }
        },
      } as unknown as KnowledgeRetrievalService,
      {
        async get() {
          return {
            isEnabled: true,
            handoverKeywords: ['platform-only'],
            systemPrompt: 'base',
            chatModel: 'gpt-test',
            temperature: 0.2,
            maxOutputTokens: 256,
            minConfidenceScore: 0.5,
            activeEmbeddingSpaceId: 'space:v1',
          }
        },
      } as unknown as PlatformAiConfigService,
      {
        async stampHandover(params: unknown) {
          stamps.push(params)
        },
      } as unknown as ConversationAiRepository,
      {} as FlowOutboundAdapter,
      {
        async insert(row: unknown) {
          usageRows.push(row)
        },
      } as unknown as AiUsageLogRepository,
      {} as AiAnswerCacheService,
      {} as AiConversationSummaryService,
      undefined,
      (_organizationId, event) => {
        sse.push(event)
      }
    )

    const result = await orchestrator.handleUnexpectedInput({
      organizationId: ORG,
      conversationId: CONV,
      sessionId: SESSION,
      messageId: MESSAGE,
      userText: 'Please get me an agent now',
      currentNode,
      tangentResume: 'IMMEDIATE_REPROMPT',
      handoverKeywords: ['agent'],
    })

    assert.equal(result.handled, true)
    assert.equal(result.action, 'HANDOVER')
    assert.equal(result.reason, 'agent')
    assert.lengthOf(retrieved, 0)
    assert.lengthOf(stamps, 1)
    assert.lengthOf(usageRows, 1)
    assert.deepEqual(sse, [
      {
        type: 'ai.handover.triggered',
        data: { conversationId: CONV, reason: 'keyword_match', matchedKeyword: 'agent' },
      },
    ])
  })

  test('ignores platform handover keywords when the flow list is empty', async ({ assert }) => {
    const retrieved: unknown[] = []

    const orchestrator = new FlowAiOrchestrator(
      {
        async retrieve(params: unknown) {
          retrieved.push(params)
          return { chunks: [{ content: 'Hours 9-5', score: 0.9, id: 'c1' }], maxScore: 0.9, meetsMinConfidence: true }
        },
      } as unknown as KnowledgeRetrievalService,
      {
        async get() {
          return {
            isEnabled: true,
            handoverKeywords: ['agent'],
            systemPrompt: 'base',
            chatModel: 'gpt-test',
            temperature: 0.2,
            maxOutputTokens: 256,
            minConfidenceScore: 0.5,
            activeEmbeddingSpaceId: 'space:v1',
          }
        },
      } as unknown as PlatformAiConfigService,
      {
        async findById() {
          return { id: CONV, aiSummary: null }
        },
      } as unknown as ConversationAiRepository,
      {
        async sendAiText() {},
      } as unknown as FlowOutboundAdapter,
      {} as AiUsageLogRepository,
      {} as AiAnswerCacheService,
      {
        async scheduleAfterAutoReply() {},
      } as unknown as AiConversationSummaryService,
      {
        async generateCompletion() {
          return {
            text: 'We open 9-5',
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
            modelName: 'gpt-test',
            latencyMs: 1,
          }
        },
      } as unknown as ChatLlmProvider
    )

    const result = await orchestrator.handleUnexpectedInput({
      organizationId: ORG,
      conversationId: CONV,
      sessionId: SESSION,
      messageId: MESSAGE,
      userText: 'I need an agent',
      currentNode,
      tangentResume: 'WAIT_FOR_NEXT',
      handoverKeywords: [],
    })

    assert.equal(result.handled, true)
    assert.equal(result.action, 'ANSWERED_HOLD')
    assert.lengthOf(retrieved, 1)
  })
})

test.group('FlowAiOrchestrator.recordSuccessfulReply', () => {
  test('writes AUTO_REPLIED usage and schedules summary', async ({ assert }) => {
    const usageRows: unknown[] = []
    const scheduled: unknown[] = []

    const orchestrator = new FlowAiOrchestrator(
      {} as KnowledgeRetrievalService,
      {} as PlatformAiConfigService,
      {} as ConversationAiRepository,
      {} as FlowOutboundAdapter,
      {
        async insert(row: unknown) {
          usageRows.push(row)
        },
      } as unknown as AiUsageLogRepository,
      {} as AiAnswerCacheService,
      {
        async scheduleAfterAutoReply(input: unknown) {
          scheduled.push(input)
        },
      } as unknown as AiConversationSummaryService
    )

    await orchestrator.recordSuccessfulReply({
      organizationId: ORG,
      conversationId: CONV,
      messageId: 'msg-1',
      modelName: 'gpt-test',
      promptTokens: 3,
      completionTokens: 5,
      totalTokens: 8,
      latencyMs: 12,
      retrievalScore: 0.88,
    })

    assert.lengthOf(usageRows, 1)
    assert.equal((usageRows[0] as { decision: string }).decision, AiUsageDecision.AUTO_REPLIED)
    assert.deepEqual(scheduled, [{ organizationId: ORG, conversationId: CONV }])
  })
})
