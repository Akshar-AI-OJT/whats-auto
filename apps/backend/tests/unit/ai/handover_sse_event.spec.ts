import { test } from '@japa/runner'
import { AiUsageDecision } from '#enums/ai_usage_decision'
import { handoverSseEvent } from '#services/ai/handover_sse_event'

const CONV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

test.group('handoverSseEvent', () => {
  test('maps keyword usage to keyword_match', ({ assert }) => {
    assert.deepEqual(
      handoverSseEvent({
        conversationId: CONV,
        reason: 'agent',
        usage: { decision: AiUsageDecision.HANDOVER_KEYWORD },
      }),
      {
        type: 'ai.handover.triggered',
        data: { conversationId: CONV, reason: 'keyword_match', matchedKeyword: 'agent' },
      }
    )
  })

  test('maps low-confidence usage to low_confidence with score', ({ assert }) => {
    assert.deepEqual(
      handoverSseEvent({
        conversationId: CONV,
        reason: 'low_confidence',
        usage: { decision: AiUsageDecision.HANDOVER_LOW_CONFIDENCE, retrievalScore: 0.21 },
      }),
      {
        type: 'ai.handover.triggered',
        data: { conversationId: CONV, reason: 'low_confidence', score: 0.21 },
      }
    )
  })

  test('maps other handovers to business_exception', ({ assert }) => {
    assert.deepEqual(
      handoverSseEvent({
        conversationId: CONV,
        reason: 'human_handover',
      }),
      {
        type: 'ai.handover.triggered',
        data: { conversationId: CONV, reason: 'business_exception' },
      }
    )
  })
})
