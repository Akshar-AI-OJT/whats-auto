import { test } from '@japa/runner'
import { AiUsageDecision } from '#enums/ai_usage_decision'
import { ConversationAiMode } from '#enums/conversation_ai_mode'
import { type AiUsageLogRepository } from '#repositories/ai_usage_log_repository'
import { type ConversationAiRepository } from '#repositories/conversation_ai_repository'
import type AiConversationSummaryService from '#services/ai/ai_conversation_summary_service'
import type AiDebounceService from '#services/ai/ai_debounce_service'
import AiDebounceTurnService from '#services/ai/ai_debounce_turn_service'
import type { InboxAiSseEvent } from '#services/ai/contracts/inbox_ai_sse'
import type { DebounceTurnJobPayload } from '#services/ai/contracts/ai_job_payloads'
import { inboxEventsHub } from '#services/inbox_events_hub'
import type { MemoryWorkingSetService } from '#services/ai/contracts/memory_working_set_service'
import FakeLlmProvider from '#services/ai/drivers/fake_llm_provider'
import type KnowledgeRetrievalService from '#services/ai/knowledge_retrieval_service'
import type PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import WhatsappOutboundException from '#exceptions/whatsapp_outbound_exception'
import type WhatsappOutboundService from '#services/whatsapp_outbound_service'

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CONV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CONTACT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const payload: DebounceTurnJobPayload = {
  organizationId: ORG,
  conversationId: CONV,
  contactId: CONTACT,
  aggregatedMessages: [],
}

function createTurn(params: {
  aiMode?: string
  isEnabled?: boolean
  keywords?: string[]
  meetsMinConfidence?: boolean
  maxScore?: number
  buffered?: Array<{ messageId: string; content: string; receivedAt: string }>
  queueText?: () => Promise<{ messageId: string; dispatchId: string }>
  useHub?: boolean
  aiSummary?: string | null
  summaryError?: boolean
}) {
  const usage: unknown[] = []
  const handovers: string[] = []
  const queued: string[] = []
  const scheduled: string[] = []
  const sse: InboxAiSseEvent[] = []
  const llm = new FakeLlmProvider()
  llm.text = 'We open at 9.'

  const debounce = {
    async drainBufferedMessages() {
      return (
        params.buffered ?? [
          {
            messageId: 'in-1',
            content: 'What are your hours?',
            receivedAt: '2026-08-11T12:00:00.000Z',
          },
        ]
      )
    },
  } as unknown as AiDebounceService

  const conversations = {
    async findById() {
      return {
        id: CONV,
        aiMode: params.aiMode ?? ConversationAiMode.AI_AUTO,
        aiSummary: params.aiSummary ?? null,
        attributedCampaignId: 'camp-1',
        contactId: CONTACT,
      }
    },
    async stampHandover(input: { reason: string }) {
      handovers.push(input.reason)
    },
  } as unknown as ConversationAiRepository

  const usageRepo = {
    async insert(row: unknown) {
      usage.push(row)
    },
  } as unknown as AiUsageLogRepository

  const retrieval = {
    async retrieve() {
      return {
        chunks: params.meetsMinConfidence === false ? [] : [{ content: 'Hours 9-5', score: 0.9 }],
        maxScore: params.maxScore ?? (params.meetsMinConfidence === false ? 0 : 0.9),
        minConfidenceScore: 0.7,
        meetsMinConfidence: params.meetsMinConfidence ?? true,
        campaign: { name: 'July launch' },
      }
    },
  } as unknown as KnowledgeRetrievalService

  const platform = {
    async get() {
      return {
        isEnabled: params.isEnabled ?? true,
        modelName: 'gpt-4o-mini',
        temperature: 0.2,
        systemPrompt: 'Be brief.',
        handoverKeywords: params.keywords ?? [],
      }
    },
  } as unknown as PlatformAiConfigService

  const outbound = {
    async queueText(input: { text: string; senderType?: string }) {
      if (params.queueText) return params.queueText()
      queued.push(`${input.senderType}:${input.text}`)
      return { messageId: 'out-1', dispatchId: 'd-1' }
    },
  } as unknown as WhatsappOutboundService

  const memory = {
    async getRecentTurns() {
      return [{ role: 'user', content: 'hi', timestamp: '2026-08-11T11:00:00.000Z' }]
    },
  } as unknown as MemoryWorkingSetService

  const summary = {
    async scheduleAfterAutoReply() {
      if (params.summaryError) throw new Error('summary boom')
      scheduled.push(CONV)
    },
  } as unknown as AiConversationSummaryService

  return {
    llm,
    usage,
    handovers,
    queued,
    scheduled,
    sse,
    service: new AiDebounceTurnService(
      debounce,
      conversations,
      usageRepo,
      retrieval,
      platform,
      outbound,
      llm,
      memory,
      params.useHub
        ? undefined
        : (_organizationId, event) => {
            sse.push(event)
          },
      summary
    ),
  }
}

test.group('AiDebounceTurnService', () => {
  test('skips when disabled, not AI_AUTO, or the buffer is empty', async ({ assert }) => {
    const disabled = createTurn({ isEnabled: false })
    const disabledResult = await disabled.service.process(payload)
    assert.equal(disabledResult.outcome, 'skipped')
    assert.lengthOf(disabled.llm.calls, 0)

    const paused = createTurn({ aiMode: ConversationAiMode.HANDOVER })
    const pausedResult = await paused.service.process(payload)
    assert.equal(pausedResult.outcome, 'skipped')

    const empty = createTurn({ buffered: [] })
    const emptyResult = await empty.service.process(payload)
    assert.equal(emptyResult.outcome, 'skipped')
    assert.lengthOf(empty.llm.calls, 0)
    assert.lengthOf(disabled.sse, 0)
    assert.lengthOf(empty.sse, 0)
    assert.lengthOf(disabled.scheduled, 0)
    assert.lengthOf(empty.scheduled, 0)
  })

  test('hands over on keyword without calling the LLM', async ({ assert }) => {
    const { service, llm, handovers, usage, sse, scheduled } = createTurn({
      keywords: ['agent'],
      buffered: [
        { messageId: 'in-1', content: 'I want an agent', receivedAt: '2026-08-11T12:00:00.000Z' },
      ],
    })
    const result = await service.process(payload)
    assert.equal(result.outcome, 'handover')
    assert.equal(result.decision, AiUsageDecision.HANDOVER_KEYWORD)
    assert.deepEqual(handovers, ['agent'])
    assert.lengthOf(llm.calls, 0)
    assert.equal((usage[0] as { decision: string }).decision, AiUsageDecision.HANDOVER_KEYWORD)
    assert.deepEqual(
      sse.map((event) => event.type),
      ['ai.handover.triggered']
    )
    assert.equal(sse[0]!.type, 'ai.handover.triggered')
    if (sse[0]!.type === 'ai.handover.triggered') {
      assert.equal(sse[0].data.reason, 'keyword_match')
      assert.equal(sse[0].data.matchedKeyword, 'agent')
    }
    assert.lengthOf(scheduled, 0)
  })

  test('hands over when retrieval misses confidence', async ({ assert }) => {
    const { service, llm, handovers, sse } = createTurn({
      meetsMinConfidence: false,
      maxScore: 0,
    })
    const result = await service.process(payload)
    assert.equal(result.decision, AiUsageDecision.HANDOVER_LOW_CONFIDENCE)
    assert.deepEqual(handovers, ['low_confidence'])
    assert.lengthOf(llm.calls, 0)
    assert.equal(sse[0]!.type, 'ai.handover.triggered')
    if (sse[0]!.type === 'ai.handover.triggered') {
      assert.equal(sse[0].data.reason, 'low_confidence')
      assert.equal(sse[0].data.score, 0)
    }
  })

  test('queues an AI reply and writes AUTO_REPLIED', async ({ assert }) => {
    const { service, llm, queued, usage, handovers, sse, scheduled } = createTurn({
      aiSummary: 'Customer asked about store hours last week.',
    })
    const result = await service.process(payload)
    assert.equal(result.outcome, 'auto_replied')
    assert.lengthOf(llm.calls, 1)
    assert.include(llm.calls[0]!.userPrompt, 'What are your hours?')
    assert.include(llm.calls[0]!.userPrompt, 'July launch')
    assert.include(llm.calls[0]!.userPrompt, 'Customer asked about store hours last week.')
    assert.deepEqual(queued, ['ai:We open at 9.'])
    assert.equal((usage[0] as { decision: string }).decision, AiUsageDecision.AUTO_REPLIED)
    assert.lengthOf(handovers, 0)
    assert.deepEqual(scheduled, [CONV])
    assert.equal(sse[0]!.type, 'ai.generation.started')
    const deltas = sse.filter((event) => event.type === 'ai.token.delta')
    assert.isAbove(deltas.length, 0)
    assert.equal(sse[sse.length - 1]!.type, 'ai.generation.completed')
    const completed = sse[sse.length - 1]!
    if (completed.type === 'ai.generation.completed') {
      assert.equal(completed.data.fullText, 'We open at 9.')
    }
  })

  test('session-window failure becomes HANDOVER_ERROR and does not throw', async ({ assert }) => {
    const { service, handovers, sse, scheduled } = createTurn({
      queueText: async () => {
        throw new WhatsappOutboundException(
          'The 24-hour customer service window has expired. Send an approved WhatsApp template to re-engage this contact.',
          { status: 422, code: 'E_OUTBOUND_SESSION_WINDOW_EXPIRED' }
        )
      },
    })
    const result = await service.process(payload)
    assert.equal(result.decision, AiUsageDecision.HANDOVER_ERROR)
    assert.lengthOf(handovers, 1)
    assert.equal(sse[0]!.type, 'ai.generation.started')
    assert.equal(sse[sse.length - 1]!.type, 'ai.handover.triggered')
    const handover = sse[sse.length - 1]!
    if (handover.type === 'ai.handover.triggered') {
      assert.equal(handover.data.reason, 'business_exception')
    }
    assert.lengthOf(scheduled, 0)
  })

  test('summary schedule failure does not undo a sent reply', async ({ assert }) => {
    const { service, queued } = createTurn({ summaryError: true })
    const result = await service.process(payload)
    assert.equal(result.outcome, 'auto_replied')
    assert.deepEqual(queued, ['ai:We open at 9.'])
  })

  test('default publisher fans out ai.* only to the conversation org', async ({ assert }) => {
    const forOrg: string[] = []
    const forOther: string[] = []
    const unsubOrg = inboxEventsHub.subscribe({
      organizationId: ORG,
      write: (chunk) => forOrg.push(chunk),
      close: () => {},
    })
    const unsubOther = inboxEventsHub.subscribe({
      organizationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      write: (chunk) => forOther.push(chunk),
      close: () => {},
    })

    try {
      const { service } = createTurn({ useHub: true })
      await service.process(payload)
      const joined = forOrg.join('')
      assert.include(joined, 'ai.generation.started')
      assert.include(joined, 'ai.token.delta')
      assert.include(joined, 'ai.generation.completed')
      assert.lengthOf(forOther, 0)
    } finally {
      unsubOrg()
      unsubOther()
    }
  })
})
