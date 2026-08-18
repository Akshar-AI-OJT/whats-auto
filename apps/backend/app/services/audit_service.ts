import db from '@adonisjs/lucid/services/db'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export type ListAuditEventsOptions = {
  /** When set, restrict to that tenant. When omitted/null, list across organizations. */
  organizationId?: string | null
  limit?: number
}

export class AuditService {
  /**
   * List authorization audit events, newest first.
   * Tenant callers pass organizationId. Super Admin may omit it for platform-wide results.
   * Includes createdAt (event time). Does not set id/createdAt on writes — DB defaults.
   */
  async listEvents(options: ListAuditEventsOptions = {}) {
    const requested = options.limit ?? DEFAULT_LIMIT
    const limit = Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)

    const query = db
      .from('authorization_audits as a')
      .leftJoin('users as u', 'u.id', 'a.actorUserId')
      .leftJoin('organizations as o', 'o.id', 'a.organizationId')
      .select(
        'a.id',
        'a.organizationId',
        'a.actorUserId',
        'a.roleId',
        'a.targetType',
        'a.targetId',
        'a.eventType',
        'a.granted',
        'a.before',
        'a.after',
        'a.reason',
        'a.createdAt',
        db.raw('u.name as "actorName"'),
        db.raw('u.email as "actorEmail"'),
        db.raw('o.name as "organizationName"')
      )
      .orderBy('a.createdAt', 'desc')
      .limit(limit)

    if (options.organizationId) {
      query.where('a.organizationId', options.organizationId)
    }

    const rows = await query

    return rows.map((r) => ({
      id: r.id as string,
      organizationId: (r.organizationId as string | null) ?? null,
      organizationName: (r.organizationName as string | null) ?? null,
      actorUserId: (r.actorUserId as string | null) ?? null,
      actorName: (r.actorName as string | null) ?? null,
      actorEmail: (r.actorEmail as string | null) ?? null,
      roleId: (r.roleId as string | null) ?? null,
      targetType: r.targetType as string,
      targetId: (r.targetId as string | null) ?? null,
      eventType: r.eventType as string,
      granted: r.granted === null || r.granted === undefined ? null : Boolean(r.granted),
      before: r.before ?? null,
      after: r.after ?? null,
      reason: (r.reason as string | null) ?? null,
      createdAt: r.createdAt as string | Date,
    }))
  }
}
