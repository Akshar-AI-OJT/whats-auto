import db from '@adonisjs/lucid/services/db'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export class AuditService {
  /**
   * List authorization audit events for a tenant, newest first.
   * Includes createdAt (event time). Does not set id/createdAt on writes — DB defaults.
   */
  async listEvents(organizationId: string, options?: { limit?: number }) {
    const requested = options?.limit ?? DEFAULT_LIMIT
    const limit = Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)

    const rows = await db
      .from('authorization_audit_events')
      .where('organizationId', organizationId)
      .select(
        'id',
        'actorUserId',
        'targetType',
        'targetId',
        'eventType',
        'before',
        'after',
        'reason',
        'createdAt'
      )
      .orderBy('createdAt', 'desc')
      .limit(limit)

    return rows.map((r) => ({
      id: r.id as string,
      actorUserId: (r.actorUserId as string | null) ?? null,
      targetType: r.targetType as string,
      targetId: (r.targetId as string | null) ?? null,
      eventType: r.eventType as string,
      before: r.before ?? null,
      after: r.after ?? null,
      reason: (r.reason as string | null) ?? null,
      createdAt: r.createdAt as string | Date,
    }))
  }
}
