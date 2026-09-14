/**
 * Shared payload for outbound inbox SSE lifecycle events
 * (message.queued | message.sent | message.failed).
 * Snapshot fields let the FE append/patch without an HTTP refetch.
 */
export type InboxOutboundLifecyclePayload = {
  organizationId: string
  conversationId: string
  messageId: string
  dispatchId: string
  providerMessageId?: string | null
  direction: 'outbound'
  senderType: string
  senderId: string | null
  contentType: string
  contentText: string | null
  /** Conversation list preview (caption, template name, or text). */
  previewText: string | null
  mediaUrl: string | null
  mediaAssetId: string | null
  status: string
  createdAt: string
  errorMessage?: string | null
}
