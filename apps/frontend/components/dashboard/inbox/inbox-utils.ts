import type {
  InboxConversation,
  InboxMessage,
  PaginationMeta,
} from '@/lib/api'

export function unwrapPaginated<T>(payload: unknown): {
  items: T[]
  meta: PaginationMeta | null
} {
  if (!payload) return { items: [], meta: null }
  if (Array.isArray(payload)) return { items: payload, meta: null }

  const root = payload as {
    data?: T[] | { data?: T[]; meta?: PaginationMeta }
    meta?: PaginationMeta
  }

  if (Array.isArray(root.data)) {
    return { items: root.data, meta: root.meta ?? null }
  }

  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return { items: root.data.data, meta: root.data.meta ?? root.meta ?? null }
  }

  return { items: [], meta: null }
}

export function unwrapList<T>(payload: unknown): T[] {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    const wrapped = payload as { data?: T[] }
    if (Array.isArray(wrapped.data)) return wrapped.data
  }
  return []
}

export function unwrapSingle<T>(payload: unknown): T | null {
  if (!payload) return null
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    const wrapped = payload as { data?: T }
    if (wrapped.data && typeof wrapped.data === 'object') {
      return wrapped.data
    }
  }
  return payload as T
}

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
