import { test } from '@japa/runner'
import type AiDebounceTurnService from '#services/ai/ai_debounce_turn_service'
import { createAiDebounceTurnHandler } from '#services/job_queue/handlers/ai_debounce_turn_handler'

test.group('ai.debounce_turn handler', () => {
  test('ignores an invalid payload', async ({ assert }) => {
    const turns = {
      process() {
        throw new Error('should not run')
      },
    } as unknown as AiDebounceTurnService

    const handler = createAiDebounceTurnHandler(turns)
    await handler({ id: '1', name: 'ai.debounce_turn', data: {} })
    assert.isTrue(true)
  })

  test('delegates a valid payload', async ({ assert }) => {
    const seen: unknown[] = []
    const turns = {
      async process(payload: unknown) {
        seen.push(payload)
        return { outcome: 'skipped', reason: 'disabled' }
      },
    } as unknown as AiDebounceTurnService

    const handler = createAiDebounceTurnHandler(turns)
    await handler({
      id: '1',
      name: 'ai.debounce_turn',
      data: {
        organizationId: 'org-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
      },
    })

    assert.deepEqual(seen, [
      {
        organizationId: 'org-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        aggregatedMessages: [],
      },
    ])
  })
})
