import { test } from '@japa/runner'
import { type ConversationAiRepository } from '#repositories/conversation_ai_repository'
import { type MemoryWorkingSetRepository } from '#repositories/memory_working_set_repository'
import AiConversationSummaryService, {
  SUMMARY_COMPLETION_TEMPERATURE,
} from '#services/ai/ai_conversation_summary_service'
import type { MemoryWorkingSetService } from '#services/ai/contracts/memory_working_set_service'
import FakeLlmProvider from '#services/ai/drivers/fake_llm_provider'
import type PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import type JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CONV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function createSummary(params: {
  isEnabled?: boolean
  threshold?: number
  turnCount?: number
  aiSummary?: string | null
  missingConversation?: boolean
  llmText?: string
  generateError?: boolean
  chatModel?: string
  summaryModel?: string | null
  maxOutputTokens?: number
  temperature?: number
}) {
  const written: string[] = []
  const enqueued: Array<{ name: string; data: Record<string, unknown> }> = []
  const llm = new FakeLlmProvider()
  llm.text = params.llmText ?? 'Customer wants store hours.'
  if (params.generateError) {
    llm.generateCompletion = async () => {
      throw new Error('llm down')
    }
  }

  const platform = {
    async get() {
      return {
        isEnabled: params.isEnabled ?? true,
        chatModel: params.chatModel ?? 'gpt-4o-mini',
        summaryModel: params.summaryModel ?? null,
        temperature: params.temperature ?? 0.2,
        maxOutputTokens: params.maxOutputTokens ?? 1024,
        summaryTurnThreshold: params.threshold ?? 10,
      }
    },
    async assertLlmReady() {},
  } as unknown as PlatformAiConfigService

  const conversations = {
    async findById() {
      if (params.missingConversation) return null
      return {
        id: CONV,
        aiMode: 'AI_AUTO',
        aiSummary: params.aiSummary ?? null,
        contactId: 'c1',
      }
    },
    async updateAiSummary(input: { summary: string }) {
      written.push(input.summary)
    },
  } as unknown as ConversationAiRepository

  const turns = {
    async countTurns() {
      return params.turnCount ?? 11
    },
  } as unknown as MemoryWorkingSetRepository

  const memory = {
    async getRecentTurns() {
      return [{ role: 'user', content: 'hours?', timestamp: '2026-08-11T12:00:00.000Z' }]
    },
  } as unknown as MemoryWorkingSetService

  const queue = {
    async ensureStarted() {
      return {
        async enqueue(name: string, data: Record<string, unknown>) {
          enqueued.push({ name, data })
          return 'job-1'
        },
      }
    },
  } as unknown as JobQueueManager

  return {
    llm,
    written,
    enqueued,
    service: new AiConversationSummaryService(platform, conversations, turns, memory, llm, queue),
  }
}

test.group('AiConversationSummaryService', () => {
  test('enqueues only when turn count exceeds the threshold', async ({ assert }) => {
    const below = createSummary({ turnCount: 10, threshold: 10 })
    await below.service.scheduleAfterAutoReply({ organizationId: ORG, conversationId: CONV })
    assert.lengthOf(below.enqueued, 0)

    const above = createSummary({ turnCount: 11, threshold: 10 })
    await above.service.scheduleAfterAutoReply({ organizationId: ORG, conversationId: CONV })
    assert.deepEqual(above.enqueued, [
      {
        name: JOB_NAMES.AI_SUMMARIZE_CONVERSATION,
        data: {
          organizationId: ORG,
          conversationId: CONV,
          triggerReason: 'turn_count_threshold',
        },
      },
    ])
  })

  test('does not enqueue when AI is disabled', async ({ assert }) => {
    const { service, enqueued } = createSummary({ isEnabled: false, turnCount: 20 })
    await service.scheduleAfterAutoReply({ organizationId: ORG, conversationId: CONV })
    assert.lengthOf(enqueued, 0)
  })

  test('writes a rolling summary and includes the previous text', async ({ assert }) => {
    const { service, llm, written } = createSummary({
      aiSummary: 'Asked about pricing.',
    })
    const result = await service.process({
      organizationId: ORG,
      conversationId: CONV,
      triggerReason: 'turn_count_threshold',
    })
    assert.equal(result.outcome, 'updated')
    assert.deepEqual(written, ['Customer wants store hours.'])
    assert.include(llm.calls[0]!.userPrompt, 'Asked about pricing.')
    assert.include(llm.calls[0]!.userPrompt, 'hours?')
    assert.equal(llm.calls[0]!.model, 'gpt-4o-mini')
    assert.equal(llm.calls[0]!.temperature, SUMMARY_COMPLETION_TEMPERATURE)
    assert.equal(llm.calls[0]!.maxTokens, 1024)
  })

  test('uses summaryModel when set and keeps temperature at 0.1', async ({ assert }) => {
    const { service, llm } = createSummary({
      chatModel: 'gpt-4o',
      summaryModel: 'gpt-4o-mini',
      maxOutputTokens: 256,
      temperature: 0.7,
    })
    await service.process({
      organizationId: ORG,
      conversationId: CONV,
      triggerReason: 'turn_count_threshold',
    })
    assert.equal(llm.calls[0]!.model, 'gpt-4o-mini')
    assert.equal(llm.calls[0]!.temperature, 0.1)
    assert.equal(llm.calls[0]!.maxTokens, 256)
  })

  test('uses chatModel when summaryModel is null', async ({ assert }) => {
    const { service, llm } = createSummary({
      chatModel: 'gpt-4o',
      summaryModel: null,
    })
    await service.process({
      organizationId: ORG,
      conversationId: CONV,
      triggerReason: 'turn_count_threshold',
    })
    assert.equal(llm.calls[0]!.model, 'gpt-4o')
    assert.equal(llm.calls[0]!.temperature, SUMMARY_COMPLETION_TEMPERATURE)
  })

  test('skips an empty completion and does not throw on LLM failure', async ({ assert }) => {
    const empty = createSummary({ llmText: '   ' })
    const emptyResult = await empty.service.process({
      organizationId: ORG,
      conversationId: CONV,
      triggerReason: 'turn_count_threshold',
    })
    assert.equal(emptyResult.outcome, 'skipped')
    assert.lengthOf(empty.written, 0)

    const failed = createSummary({ generateError: true })
    const failedResult = await failed.service.process({
      organizationId: ORG,
      conversationId: CONV,
      triggerReason: 'turn_count_threshold',
    })
    assert.equal(failedResult.outcome, 'skipped')
    assert.lengthOf(failed.written, 0)
  })
})
