import type { InboxConversation, InboxMessage } from '@/lib/api'
import type {
  InboxSseClientEvent,
  InboxSseMessageReceivedPayload,
} from '@/lib/inbox-sse'
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

function lifecycleStatus(event: InboxSseClientEvent): string | null {
  if (event.type === 'message.queued') return 'queued'
  if (event.type === 'message.sent') return 'sent'
  if (event.type === 'message.failed') return 'failed'
  if (event.type === 'status.updated') return event.payload.status
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

  if (event.type !== 'message.received') return conversation

  const alreadyApplied =
    conversation.lastMessageAt === event.payload.occurredAt &&
    (event.payload.contentText == null || conversation.lastMessageText === event.payload.contentText)
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
  if (index < 0) {
    return {
      messages,
      missingMessage: event.type === 'message.queued' || event.type === 'message.sent',
    }
  }

  const current = messages[index]!
  const next = messages.slice()
  next[index] = {
    ...current,
    status,
    providerMessageId:
      event.type === 'status.updated'
        ? event.payload.providerMessageId
        : (event.payload.providerMessageId ?? current.providerMessageId),
  }
  return { messages: next, missingMessage: false }
}

export function applyInboxSseToList(
  conversations: InboxConversation[],
  event: InboxSseClientEvent,
  filters: InboxListFilters
): { conversations: InboxConversation[]; fetchConversationId: string | null } {
  const conversationId = event.payload.conversationId
  const index = conversations.findIndex((conversation) => conversation.id === conversationId)

  if (event.type === 'ai.handover.triggered') {
    if (index < 0) return { conversations, fetchConversationId: null }
    const updated = applyInboxSseToConversation(conversations[index]!, event)
    const next = conversations.slice()
    next[index] = updated
    return { conversations: next, fetchConversationId: null }
  }

  if (event.type === 'message.received') {
    if (index >= 0) {
      const updated = applyInboxSseToConversation(conversations[index]!, event)
      if (!matchesInboxListFilters(updated, filters)) {
        return {
          conversations: conversations.filter((conversation) => conversation.id !== conversationId),
          fetchConversationId: null,
        }
      }
      const rest = conversations.filter((_, i) => i !== index)
      return { conversations: [updated, ...rest], fetchConversationId: null }
    }

    return {
      conversations,
      fetchConversationId: filters.page === 1 ? conversationId : null,
    }
  }

  if (event.type === 'message.queued' || event.type === 'message.sent') {
    if (index >= 0 || filters.page === 1) {
      return { conversations, fetchConversationId: conversationId }
    }
  }

  return { conversations, fetchConversationId: null }
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
