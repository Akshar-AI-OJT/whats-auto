import { test } from '@japa/runner'
import { publishInboxAiEvent } from '#services/ai/publish_inbox_ai_sse'
import { inboxEventsHub } from '#services/inbox_events_hub'

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CONV = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

test.group('inboxEventsHub AI isolation', () => {
  test('delivers ai.* events only to the same organization', ({ assert }) => {
    const forA: string[] = []
    const forB: string[] = []
    const unsubA = inboxEventsHub.subscribe({
      organizationId: ORG_A,
      write: (chunk) => forA.push(chunk),
      close: () => {},
    })
    const unsubB = inboxEventsHub.subscribe({
      organizationId: ORG_B,
      write: (chunk) => forB.push(chunk),
      close: () => {},
    })

    try {
      publishInboxAiEvent(ORG_A, {
        type: 'ai.generation.started',
        data: { conversationId: CONV, promptAt: '2026-08-11T12:00:00.000Z' },
      })
      publishInboxAiEvent(ORG_A, {
        type: 'ai.token.delta',
        data: { conversationId: CONV, delta: 'Hi', chunkIndex: 0 },
      })
      publishInboxAiEvent(ORG_B, {
        type: 'ai.handover.triggered',
        data: { conversationId: CONV, reason: 'keyword_match', matchedKeyword: 'agent' },
      })

      assert.lengthOf(forA, 2)
      assert.include(forA[0]!, 'ai.generation.started')
      assert.include(forA[1]!, 'ai.token.delta')
      assert.notInclude(forA.join(''), 'ai.handover.triggered')

      assert.lengthOf(forB, 1)
      assert.include(forB[0]!, 'ai.handover.triggered')
      assert.notInclude(forB.join(''), 'ai.generation.started')
    } finally {
      unsubA()
      unsubB()
    }
  })
})
