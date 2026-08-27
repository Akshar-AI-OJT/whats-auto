import { ConversationAiMode } from '#enums/conversation_ai_mode'
import { FlowSessionStatus } from '#enums/flow_session_status'

export type AutomationVisibility = {
  automationBlocked: boolean
  openFlowSessionStatus: string | null
}

/**
 * Derived inbox fields: automation is off when the thread is not AI_AUTO
 * or an open session is PAUSED_FOR_HUMAN ([D62]).
 */
export function deriveAutomationVisibility(
  aiMode: string,
  openFlowSessionStatus: string | null
): AutomationVisibility {
  const pausedForHuman = openFlowSessionStatus === FlowSessionStatus.PAUSED_FOR_HUMAN
  return {
    automationBlocked: aiMode !== ConversationAiMode.AI_AUTO || pausedForHuman,
    openFlowSessionStatus,
  }
}
