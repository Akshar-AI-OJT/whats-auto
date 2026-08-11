import type { HttpContext } from '@adonisjs/core/http'
import { NotificationService } from '#services/notification_service'
import {
  listNotificationsValidator,
  notificationIdParamValidator,
} from '#validators/notification'
import '#types/http'

export default class NotificationsController {
  /**
   * @index
   * @summary List notifications
   * @description Paginated in-app notifications for the authenticated user in the active organization. Newest first by createdAt.
   * @tag Notifications
   * @security BearerAuth
   * @paramQuery page - Page number (default 1) - @type(number)
   * @paramQuery limit - Items per page (1-100, default 20) - @type(number)
   * @responseBody 200 - { "data": [{ "id": "uuid", "type": "assignment", "title": "Assigned", "body": null, "readAt": null, "createdAt": "2026-08-10T12:00:00.000Z" }], "meta": { "total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   */
  async index({ request, serialize }: HttpContext) {
    const qs = await request.validateUsing(listNotificationsValidator, {
      data: request.qs(),
    })

    const result = await new NotificationService().listNotificationsPaginated({
      organizationId: request.activeMember!.organizationId,
      userId: request.authUser!.id,
      page: qs.page,
      limit: qs.limit,
    })

    return serialize(result)
  }

  /**
   * @markAsRead
   * @summary Mark one notification as read
   * @description Sets readAt on a notification owned by the authenticated user in the active organization. Idempotent if already read.
   * @tag Notifications
   * @security BearerAuth
   * @paramPath id - Notification id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "readAt": "2026-08-10T12:05:00.000Z", "title": "Assigned" } }
   * @responseBody 404 - { "error": "Notification not found", "code": "E_NOTIFICATION_NOT_FOUND" }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   */
  async markAsRead({ request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(notificationIdParamValidator, {
      data: params,
    })

    const notification = await new NotificationService().markAsRead({
      organizationId: request.activeMember!.organizationId,
      userId: request.authUser!.id,
      notificationId: id,
    })

    return serialize(notification)
  }

  /**
   * @markAllAsRead
   * @summary Mark all notifications as read
   * @description Sets readAt on all unread notifications for the authenticated user in the active organization.
   * @tag Notifications
   * @security BearerAuth
   * @responseBody 200 - { "data": { "updatedCount": 3 } }
   * @responseBody 401 - { "error": "Missing or invalid session" }
   */
  async markAllAsRead({ request, serialize }: HttpContext) {
    const result = await new NotificationService().markAllAsRead({
      organizationId: request.activeMember!.organizationId,
      userId: request.authUser!.id,
    })

    return serialize(result)
  }
}
