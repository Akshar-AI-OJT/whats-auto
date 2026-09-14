import { test } from '@japa/runner'
import { ConversationAiMode } from '#enums/conversation_ai_mode'
import { FlowSessionStatus } from '#enums/flow_session_status'
import { deriveAutomationVisibility } from '#services/ai/automation_visibility'

test.group('deriveAutomationVisibility', () => {
  test('AI_AUTO without pause is not blocked', ({ assert }) => {
    assert.deepEqual(deriveAutomationVisibility(ConversationAiMode.AI_AUTO, null), {
      automationBlocked: false,
      openFlowSessionStatus: null,
    })
  })

  test('HUMAN_ACTIVE and HANDOVER are blocked', ({ assert }) => {
    assert.isTrue(
      deriveAutomationVisibility(ConversationAiMode.HUMAN_ACTIVE, null).automationBlocked
    )
    assert.isTrue(deriveAutomationVisibility(ConversationAiMode.HANDOVER, null).automationBlocked)
  })

  test('orphan PAUSED_FOR_HUMAN with AI_AUTO is blocked', ({ assert }) => {
    const result = deriveAutomationVisibility(
      ConversationAiMode.AI_AUTO,
      FlowSessionStatus.PAUSED_FOR_HUMAN
    )
    assert.isTrue(result.automationBlocked)
    assert.equal(result.openFlowSessionStatus, FlowSessionStatus.PAUSED_FOR_HUMAN)
  })

  test('WAITING_FOR_INPUT with AI_AUTO is not blocked', ({ assert }) => {
    const result = deriveAutomationVisibility(
      ConversationAiMode.AI_AUTO,
      FlowSessionStatus.WAITING_FOR_INPUT
    )
    assert.isFalse(result.automationBlocked)
    assert.equal(result.openFlowSessionStatus, FlowSessionStatus.WAITING_FOR_INPUT)
  })
})
