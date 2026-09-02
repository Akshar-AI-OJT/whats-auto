import { test } from '@japa/runner'
import { ConversationAiMode } from '#enums/conversation_ai_mode'
import { canTransitionAiMode } from '#services/ai/conversation_ai_transitions'

test.group('canTransitionAiMode', () => {
  test('allows the Phase 11 edges only', ({ assert }) => {
    assert.isTrue(canTransitionAiMode(ConversationAiMode.AI_AUTO, ConversationAiMode.HANDOVER))
    assert.isTrue(canTransitionAiMode(ConversationAiMode.AI_AUTO, ConversationAiMode.HUMAN_ACTIVE))
    assert.isTrue(canTransitionAiMode(ConversationAiMode.HANDOVER, ConversationAiMode.HUMAN_ACTIVE))
    assert.isTrue(canTransitionAiMode(ConversationAiMode.HANDOVER, ConversationAiMode.AI_AUTO))
    assert.isTrue(canTransitionAiMode(ConversationAiMode.HUMAN_ACTIVE, ConversationAiMode.AI_AUTO))

    assert.isFalse(
      canTransitionAiMode(ConversationAiMode.HUMAN_ACTIVE, ConversationAiMode.HANDOVER)
    )
    assert.isFalse(canTransitionAiMode(ConversationAiMode.AI_AUTO, ConversationAiMode.AI_AUTO))
    assert.isFalse(canTransitionAiMode('nope', ConversationAiMode.AI_AUTO))
  })
})
