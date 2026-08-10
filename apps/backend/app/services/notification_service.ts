import db from '@adonisjs/lucid/services/db'
import NotificationException from '#exceptions/notification_exception'

export type NotificationRecord = {
  id: string
  organizationId: string
  userId: string
  type: string
  conversationId: string | null
  contactId: string | null
  actorUserId: string | null
  title: string
  body: string | null
  readAt: string | null
  createdAt: string
}

const NOTIFICATION_COLUMNS = [
  'id',
  'organizationId',
  'userId',
  'type',
  'conversationId',
  'contactId',
  'actorUserId',
  'title',
  'body',
  'readAt',
  'createdAt',
] as const

function toIso(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function mapNotificationRow(r: Record<string, unknown>): NotificationRecord {
  return {
    id: r.id as string,
    organizationId: r.organizationId as string,
    userId: r.userId as string,
    type: r.type as string,
    conversationId: (r.conversationId as string | null) ?? null,
    contactId: (r.contactId as string | null) ?? null,
    actorUserId: (r.actorUserId as string | null) ?? null,
    title: r.title as string,
    body: (r.body as string | null) ?? null,
    readAt: toIso(r.readAt),
    createdAt: toIso(r.createdAt) as string,
  }
}

/**
 * In-app notifications for agents.
 *
 * Knex is used because DB columns are camelCase (Lucid emits snake_case).
 * Controllers pass organizationId / userId explicitly (same as inbox modules).
 */
export class NotificationService {
  /**
   * Paginated notifications for the authenticated user within the active org.
   * Newest first by createdAt.
   */
  async listNotificationsPaginated(params: {
    organizationId: string
    userId: string
    page?: number
    limit?: number
  }) {
    const page = params.page ?? 1
    const limit = params.limit ?? 20

    const query = db
      .from('notifications')
      .where('organizationId', params.organizationId)
      .where('userId', params.userId)

    const countResult = await query.clone().count('* as total').first()
    const total = Number(countResult?.total ?? 0)

    const rows = await query
      .clone()
      .select([...NOTIFICATION_COLUMNS])
      .orderBy('createdAt', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)

    const lastPage = Math.ceil(total / limit) || 1

    return {
      data: rows.map((r) => mapNotificationRow(r)),
      meta: {
        total,
        perPage: limit,
        currentPage: page,
        lastPage,
      },
    }
  }

  /**
   * Mark a single notification as read (sets readAt).
   * Idempotent: if already read, returns the existing row unchanged.
   */
  async markAsRead(params: {
    organizationId: string
    userId: string
    notificationId: string
  }): Promise<NotificationRecord> {
    const existing = await this.findOwnedOrFail(params)

    if (existing.readAt != null) {
      return mapNotificationRow(existing)
    }

    const [row] = await db
      .from('notifications')
      .where('id', params.notificationId)
      .where('organizationId', params.organizationId)
      .where('userId', params.userId)
      .whereNull('readAt')
      .update({ readAt: new Date() })
      .returning([...NOTIFICATION_COLUMNS])

    if (row) {
      return mapNotificationRow(row)
    }

    // Concurrent mark — re-load owned row
    const refreshed = await this.findOwnedOrFail(params)
    return mapNotificationRow(refreshed)
  }

  /**
   * Mark all unread notifications as read for the authenticated user in this org.
   */
  async markAllAsRead(params: {
    organizationId: string
    userId: string
  }): Promise<{ updatedCount: number }> {
    const updatedCount = await db
      .from('notifications')
      .where('organizationId', params.organizationId)
      .where('userId', params.userId)
      .whereNull('readAt')
      .update({ readAt: new Date() })

    return { updatedCount: Number(updatedCount) }
  }

  private async findOwnedOrFail(params: {
    organizationId: string
    userId: string
    notificationId: string
  }) {
    const row = await db
      .from('notifications')
      .where('id', params.notificationId)
      .where('organizationId', params.organizationId)
      .where('userId', params.userId)
      .select([...NOTIFICATION_COLUMNS])
      .first()

    if (!row) {
      throw NotificationException.notFound()
    }

    return row
  }
}
