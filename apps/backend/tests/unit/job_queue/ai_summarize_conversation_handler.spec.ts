import { test } from '@japa/runner'
import type AiConversationSummaryService from '#services/ai/ai_conversation_summary_service'
import { createAiSummarizeConversationHandler } from '#services/job_queue/handlers/ai_summarize_conversation_handler'

test.group('ai.summarize_conversation handler', () => {
  test('ignores an invalid payload', async ({ assert }) => {
    const summaries = {
      process() {
        throw new Error('should not run')
      },
    } as unknown as AiConversationSummaryService

    const handler = createAiSummarizeConversationHandler(summaries)
    await handler({ id: '1', name: 'ai.summarize_conversation', data: {} })
    assert.isTrue(true)
  })

  test('delegates a valid payload', async ({ assert }) => {
    const seen: unknown[] = []
    const summaries = {
      async process(payload: unknown) {
        seen.push(payload)
        return { outcome: 'updated' }
      },
    } as unknown as AiConversationSummaryService

    const handler = createAiSummarizeConversationHandler(summaries)
    await handler({
      id: '1',
      name: 'ai.summarize_conversation',
      data: {
        organizationId: 'org-1',
        conversationId: 'conv-1',
        triggerReason: 'turn_count_threshold',
      },
    })

    assert.deepEqual(seen, [
      {
        organizationId: 'org-1',
        conversationId: 'conv-1',
        triggerReason: 'turn_count_threshold',
      },
    ])
  })
})
