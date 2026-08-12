import type { Notification, PaginationMeta } from '@/lib/api'

export function unwrapNotificationsPaginated(payload: unknown): {
  items: Notification[]
  meta: PaginationMeta | null
} {
  if (!payload) return { items: [], meta: null }
  if (Array.isArray(payload)) return { items: payload, meta: null }

  const root = payload as {
    data?: Notification[] | { data?: Notification[]; meta?: PaginationMeta }
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

export function unwrapNotification(payload: unknown): Notification | null {
  if (!payload) return null
  if (typeof payload === 'object' && 'id' in payload && 'title' in payload) {
    return payload as Notification
  }
  const wrapped = payload as { data?: Notification }
  if (wrapped.data && typeof wrapped.data === 'object' && 'id' in wrapped.data) {
    return wrapped.data
  }
  return null
}

export function formatNotificationType(type: string): string {
  return type
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export type NotificationVisualCategory = 'campaign' | 'message' | 'billing' | 'system'

export function notificationVisualCategory(type: string): NotificationVisualCategory {
  if (type.startsWith('campaign_')) return 'campaign'
  if (type.startsWith('billing_')) return 'billing'
  if (type.startsWith('inbox_')) return 'message'
  return 'system'
}
