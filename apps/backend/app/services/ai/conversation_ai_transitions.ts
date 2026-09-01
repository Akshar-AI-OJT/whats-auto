import { ConversationAiMode } from '#enums/conversation_ai_mode'

const ALLOWED: Record<ConversationAiMode, ConversationAiMode[]> = {
  [ConversationAiMode.AI_AUTO]: [ConversationAiMode.HANDOVER, ConversationAiMode.HUMAN_ACTIVE],
  [ConversationAiMode.HANDOVER]: [ConversationAiMode.HUMAN_ACTIVE, ConversationAiMode.AI_AUTO],
  [ConversationAiMode.HUMAN_ACTIVE]: [ConversationAiMode.AI_AUTO],
}

export function canTransitionAiMode(from: string, to: ConversationAiMode): boolean {
  if (!isConversationAiMode(from)) return false
  return ALLOWED[from].includes(to)
}

export function isConversationAiMode(value: string): value is ConversationAiMode {
  return (CONVERSATION_AI_MODE_VALUES as string[]).includes(value)
}

const CONVERSATION_AI_MODE_VALUES = Object.values(ConversationAiMode)
