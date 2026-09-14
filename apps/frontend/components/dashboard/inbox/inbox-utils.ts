import type {
  InboxConversation,
  InboxMessage,
} from '@/lib/api'
import { unwrapList, unwrapPage, unwrapSingle } from '@/lib/api-unwrap'

export { unwrapList, unwrapSingle }
export const unwrapPaginated = unwrapPage

/** Merge lifecycle API responses that omit nested `contact`. */
export function mergeConversationUpdate(
  current: InboxConversation,
  patch: Partial<InboxConversation> | null | undefined
): InboxConversation {
  if (!patch) return current
  return {
    ...current,
    ...patch,
    contact: patch.contact ?? current.contact,
  }
}

export function contactLabel(conversation: Pick<InboxConversation, 'contact' | 'contactId'>) {
  const name = conversation.contact?.name?.trim()
  if (name) return name
  return conversation.contact?.phone || conversation.contactId
}

export function contactInitials(conversation: Pick<InboxConversation, 'contact' | 'contactId'>) {
  const source = contactLabel(conversation)
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase() || '?'
}

export function formatMessageTime(value: string | null | undefined) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function formatRelativeListTime(value: string | null | undefined) {
  if (!value) return ''
  try {
    const date = new Date(value)
    const now = new Date()
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()

    if (sameDay) {
      return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date)
    }

    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
  } catch {
    return ''
  }
}

export function messageBodyText(message: InboxMessage) {
  if (message.contentText?.trim()) return message.contentText.trim()
  if (message.contentType !== 'text') {
    return `[${message.contentType}]`
  }
  return ''
}

export function isCustomerMessage(message: InboxMessage) {
  return message.direction === 'inbound' || message.senderType === 'contact'
}

/** Stable key for consecutive same-direction / same-sender grouping. */
export function messageGroupKey(message: InboxMessage): string {
  const senderId = message.senderId ?? message.sender.id ?? message.sender.name ?? ''
  return `${message.direction}:${message.senderType}:${senderId}`
}

export type MessageGroupPosition = {
  isGroupStart: boolean
  isGroupEnd: boolean
}

export function getMessageGroupPositions(messages: InboxMessage[]): MessageGroupPosition[] {
  return messages.map((message, index) => {
    const key = messageGroupKey(message)
    const prevKey = index > 0 ? messageGroupKey(messages[index - 1]!) : null
    const nextKey = index < messages.length - 1 ? messageGroupKey(messages[index + 1]!) : null
    return {
      isGroupStart: key !== prevKey,
      isGroupEnd: key !== nextKey,
    }
  })
}
