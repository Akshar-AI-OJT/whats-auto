/**
 * Payload for FLOWS_ADVANCE_SESSION. singletonKey = conversationId serialises turns.
 */
export type FlowAdvanceSessionJobPayload = {
  organizationId: string
  conversationId: string
  contactId: string
  messageId: string
  contentText: string | null
  interactiveReplyId: string | null
  intent:
    { type: 'resume'; sessionId: string } | { type: 'start'; flowId: string; flowVersionId: string }
}
