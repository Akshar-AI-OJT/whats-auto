import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthzPrincipal } from '#types/http'

export type NotificationResource = {
  id?: string
  organizationId?: string
  userId?: string
}

export default class NotificationPolicy extends BasePolicy {
  viewList(_user: AuthzPrincipal): boolean {
    return true
  }

  markAsRead(user: AuthzPrincipal, notification?: NotificationResource): boolean {
    if (notification?.userId && notification.userId !== user.id) {
      return false
    }
    if (
      notification?.organizationId &&
      notification.organizationId !== user.activeMember?.organizationId
    ) {
      return false
    }
    return true
  }

  markAllAsRead(_user: AuthzPrincipal): boolean {
    return true
  }
}
