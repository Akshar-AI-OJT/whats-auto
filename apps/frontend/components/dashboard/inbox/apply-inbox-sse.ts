import type { InboxConversation, InboxMessage } from '@/lib/api'
import type {
  InboxSseClientEvent,
  InboxSseMessageLifecyclePayload,
  InboxSseMessageReceivedPayload,
} from '@/lib/inbox-sse'
import { hasLifecycleMessageSnapshot } from '@/lib/inbox-sse'
import { aiHandoverReasonFromSse } from './inbox-ai-mode'

export type InboxListFilters = {
  page: number
  search: string
  status: 'all' | 'open' | 'pending' | 'closed'
  assignedAgentId: string
}

function messageFromReceived(payload: InboxSseMessageReceivedPayload): InboxMessage {
  return {
    id: payload.messageId,
    organizationId: payload.organizationId,
    conversationId: payload.conversationId,
    senderType: 'contact',
    senderId: payload.contactId,
    direction: 'inbound',
    contentType: payload.contentType,
    contentText: payload.contentText,
    mediaUrl: null,
    mediaAssetId: null,
    status: payload.status,
    providerMessageId: payload.providerMessageId,
    errorMessage: null,
    createdAt: payload.createdAt,
    updatedAt: null,
    sender: {
      type: 'contact',
      id: payload.contactId,
      name: null,
    },
  }
}

function messageFromLifecycle(
  payload: InboxSseMessageLifecyclePayload,
  status: string
): InboxMessage | null {
  if (!hasLifecycleMessageSnapshot(payload)) return null

  const senderType = payload.senderType!
  const senderId = payload.senderId ?? null

  return {
    id: payload.messageId,
    organizationId: payload.organizationId,
    conversationId: payload.conversationId,
    senderType,
    senderId,
    direction: 'outbound',
    contentType: payload.contentType!,
    contentText: payload.contentText ?? null,
    mediaUrl: payload.mediaUrl ?? null,
    mediaAssetId: payload.mediaAssetId ?? null,
    status: payload.status ?? status,
    providerMessageId: payload.providerMessageId ?? null,
    errorMessage: payload.errorMessage ?? null,
    createdAt: payload.createdAt!,
    updatedAt: null,
    sender: {
      type: senderType,
      id: senderId,
      name: null,
    },
  }
}

function lifecycleStatus(event: InboxSseClientEvent): string | null {
  if (event.type === 'message.queued') return 'queued'
  if (event.type === 'message.sent') return 'sent'
  if (event.type === 'message.failed') return 'failed'
  if (event.type === 'status.updated') return event.payload.status
  return null
}

function lifecyclePreviewText(payload: InboxSseMessageLifecyclePayload): string | null {
  if (typeof payload.previewText === 'string' && payload.previewText.length > 0) {
    return payload.previewText
  }
  if (typeof payload.contentText === 'string' && payload.contentText.length > 0) {
    return payload.contentText
  }
  return null
}

export function matchesInboxListFilters(
  conversation: InboxConversation,
  filters: InboxListFilters
): boolean {
  if (filters.status !== 'all' && conversation.status !== filters.status) return false
  if (
    filters.assignedAgentId !== 'all' &&
    conversation.assignedAgentId !== filters.assignedAgentId
  ) {
    return false
  }

  const search = filters.search.trim().toLowerCase()
  if (!search) return true

  const name = conversation.contact?.name?.toLowerCase() ?? ''
  const phone = conversation.contact?.phone?.toLowerCase() ?? ''
  return name.includes(search) || phone.includes(search)
}

export function applyInboxSseToConversation(
  conversation: InboxConversation,
  event: InboxSseClientEvent
): InboxConversation {
  if (conversation.id !== event.payload.conversationId) return conversation

  if (event.type === 'ai.handover.triggered') {
    return {
      ...conversation,
      aiMode: 'HANDOVER',
      aiHandoverReason: aiHandoverReasonFromSse(event.payload),
    }
  }

  if (event.type === 'message.received') {
    const alreadyApplied =
      conversation.lastMessageAt === event.payload.occurredAt &&
      (event.payload.contentText == null ||
        conversation.lastMessageText === event.payload.contentText)
    if (alreadyApplied) return conversation

    return {
      ...conversation,
      status: 'open',
      closedAt: null,
      lastMessageText: event.payload.contentText ?? conversation.lastMessageText,
      lastMessageAt: event.payload.occurredAt,
      unreadCount: conversation.unreadCount + 1,
      updatedAt: event.payload.occurredAt,
    }
  }

  if (event.type === 'message.queued' || event.type === 'message.sent') {
    const preview = lifecyclePreviewText(event.payload)
    const at = event.payload.createdAt
    if (!preview && !at) return conversation
    return {
      ...conversation,
      lastMessageText: preview ?? conversation.lastMessageText,
      lastMessageAt: at ?? conversation.lastMessageAt,
      unreadCount: 0,
      updatedAt: at ?? conversation.updatedAt,
    }
  }

  return conversation
}

export function applyInboxSseToMessages(
  messages: InboxMessage[],
  event: InboxSseClientEvent,
  activeConversationId: string
): { messages: InboxMessage[]; missingMessage: boolean } {
  if (event.payload.conversationId !== activeConversationId) {
    return { messages, missingMessage: false }
  }

  if (event.type === 'message.received') {
    if (messages.some((message) => message.id === event.payload.messageId)) {
      return { messages, missingMessage: false }
    }
    return {
      messages: [...messages, messageFromReceived(event.payload)],
      missingMessage: false,
    }
  }

  if (event.type === 'ai.handover.triggered') {
    return { messages, missingMessage: false }
  }

  const status = lifecycleStatus(event)
  if (!status) return { messages, missingMessage: false }

  const index = messages.findIndex((message) => message.id === event.payload.messageId)
  if (index >= 0) {
    const current = messages[index]!
    const next = messages.slice()
    next[index] = {
      ...current,
      status,
      providerMessageId:
        event.type === 'status.updated'
          ? event.payload.providerMessageId
          : (event.payload.providerMessageId ?? current.providerMessageId),
      errorMessage:
        event.type === 'message.failed'
          ? (event.payload.errorMessage ?? current.errorMessage)
          : current.errorMessage,
    }
    return { messages: next, missingMessage: false }
  }

  if (
    event.type === 'message.queued' ||
    event.type === 'message.sent' ||
    event.type === 'message.failed'
  ) {
    const appended = messageFromLifecycle(event.payload, status)
    if (appended) {
      return { messages: [...messages, appended], missingMessage: false }
    }
    return {
      messages,
      missingMessage: event.type === 'message.queued' || event.type === 'message.sent',
    }
  }

  return { messages, missingMessage: false }
}

export function applyInboxSseToList(
  conversations: InboxConversation[],
  event: InboxSseClientEvent,
  filters: InboxListFilters
): {
  conversations: InboxConversation[]
  fetchConversationId: string | null
  notifyNewActivity: boolean
} {
  const conversationId = event.payload.conversationId
  const index = conversations.findIndex((conversation) => conversation.id === conversationId)

  if (event.type === 'ai.handover.triggered') {
    if (index < 0) return { conversations, fetchConversationId: null, notifyNewActivity: false }
    const updated = applyInboxSseToConversation(conversations[index]!, event)
    const next = conversations.slice()
    next[index] = updated
    return { conversations: next, fetchConversationId: null, notifyNewActivity: false }
  }

  if (event.type === 'message.received') {
    if (index >= 0) {
      const updated = applyInboxSseToConversation(conversations[index]!, event)
      if (!matchesInboxListFilters(updated, filters)) {
        return {
          conversations: conversations.filter((conversation) => conversation.id !== conversationId),
          fetchConversationId: null,
          notifyNewActivity: true,
        }
      }
      const rest = conversations.filter((_, i) => i !== index)
      return {
        conversations: [updated, ...rest],
        fetchConversationId: null,
        notifyNewActivity: false,
      }
    }

    // Not on this page / list yet.
    if (filters.page === 1) {
      return {
        conversations,
        fetchConversationId: conversationId,
        notifyNewActivity: false,
      }
    }

    return {
      conversations,
      fetchConversationId: null,
      notifyNewActivity: true,
    }
  }

  if (event.type === 'message.queued' || event.type === 'message.sent') {
    if (index >= 0) {
      const updated = applyInboxSseToConversation(conversations[index]!, event)
      if (!matchesInboxListFilters(updated, filters)) {
        return {
          conversations: conversations.filter((conversation) => conversation.id !== conversationId),
          fetchConversationId: null,
          notifyNewActivity: true,
        }
      }
      const rest = conversations.filter((_, i) => i !== index)
      return {
        conversations: [updated, ...rest],
        fetchConversationId: null,
        notifyNewActivity: false,
      }
    }

    // Outbound without a visible row: only fetch when on page 1 and snapshot is thin
    // (no contact fields on lifecycle). Prefer chip notify off page 1.
    if (filters.page === 1 && !hasLifecycleMessageSnapshot(event.payload)) {
      return {
        conversations,
        fetchConversationId: conversationId,
        notifyNewActivity: false,
      }
    }

    if (filters.page === 1) {
      // Snapshot present but conversation not in list — still need HTTP for contact card.
      return {
        conversations,
        fetchConversationId: conversationId,
        notifyNewActivity: false,
      }
    }

    return { conversations, fetchConversationId: null, notifyNewActivity: true }
  }

  return { conversations, fetchConversationId: null, notifyNewActivity: false }
}

export function upsertConversationInList(
  conversations: InboxConversation[],
  conversation: InboxConversation,
  filters: InboxListFilters
): InboxConversation[] {
  if (!matchesInboxListFilters(conversation, filters)) {
    return conversations.filter((item) => item.id !== conversation.id)
  }
  const without = conversations.filter((item) => item.id !== conversation.id)
  return [conversation, ...without]
}
