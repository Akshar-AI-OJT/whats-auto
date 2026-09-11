import type { Notification, PaginationMeta } from '@/lib/api'
import { unwrapPage, unwrapSingle } from '@/lib/api-unwrap'

export function unwrapNotificationsPaginated(payload: unknown): {
  items: Notification[]
  meta: PaginationMeta | null
} {
  return unwrapPage<Notification>(payload)
}

export function unwrapNotification(payload: unknown): Notification | null {
  return unwrapSingle<Notification>(payload)
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
