import db from '@adonisjs/lucid/services/db'
import type { DateTime } from 'luxon'
import { eventTypesForScope, type AuditListScope } from '#abilities/audit_events'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export type ListAuditEventsOptions = {
  scope: AuditListScope
  /** When set, restrict to that tenant. When omitted/null, list across organizations. */
  organizationId?: string | null
  limit?: number
  search?: string
  eventType?: string
  actorUserId?: string
  targetType?: string
  dateFrom?: DateTime | Date | string
  dateTo?: DateTime | Date | string
  includeFacets?: boolean
}

export type AuditActorFacet = {
  id: string
  name: string | null
  email: string | null
}

export type AuditListResult = {
  events: ReturnType<AuditService['mapRow']>[]
  eventTypes?: string[]
  actors?: AuditActorFacet[]
  targetTypes?: string[]
}

function escapeIlike(value: string): string {
  return `%${value.replace(/[%_\\]/g, '\\$&')}%`
}

function isLuxonDateTime(value: DateTime | Date | string): value is DateTime {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Date) &&
    typeof (value as DateTime).toJSDate === 'function'
  )
}

function toJsDate(value: DateTime | Date | string): Date {
  if (value instanceof Date) return value
  if (typeof value === 'string') return new Date(value)
  return value.toJSDate()
}

function isDateOnlyString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

function isUtcMidnight(date: Date): boolean {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  )
}

function isLocalMidnight(date: Date): boolean {
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  )
}

function isStartOfCalendarDay(value: DateTime | Date | string, date: Date): boolean {
  if (typeof value === 'string' && isDateOnlyString(value)) return true
  if (isLuxonDateTime(value)) {
    return value.hour === 0 && value.minute === 0 && value.second === 0 && value.millisecond === 0
  }
  return isUtcMidnight(date) || isLocalMidnight(date)
}

function toInclusiveStart(value: DateTime | Date | string): Date {
  if (typeof value === 'string' && isDateOnlyString(value)) {
    return new Date(`${value.trim()}T00:00:00.000Z`)
  }
  return toJsDate(value)
}

function toInclusiveEnd(value: DateTime | Date | string): Date {
  if (typeof value === 'string' && isDateOnlyString(value)) {
    return new Date(`${value.trim()}T23:59:59.999Z`)
  }
  if (isLuxonDateTime(value) && isStartOfCalendarDay(value, value.toJSDate())) {
    return value.endOf('day').toJSDate()
  }
  const date = toJsDate(value)
  if (Number.isNaN(date.getTime()) || !isStartOfCalendarDay(value, date)) return date
  if (isUtcMidnight(date)) {
    const end = new Date(date)
    end.setUTCHours(23, 59, 59, 999)
    return end
  }
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return end
}

export class AuditService {
  /**
   * List authorization audit events, newest first.
   * Scope is server-derived: platform vs tenant event catalogs never mix.
   * Search/event/actor/entity/date filters run before limit.
   */
  async listEvents(options: ListAuditEventsOptions) {
    const requested = options.limit ?? DEFAULT_LIMIT
    const limit = Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
    const catalog = eventTypesForScope(options.scope)
    const catalogSet = new Set(catalog)

    const query = db
      .from('authorization_audits as a')
      .leftJoin('users as u', 'u.id', 'a.actorUserId')
      .leftJoin('organizations as o', 'o.id', 'a.organizationId')
      .whereIn('a.eventType', [...catalog])
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

    if (options.organizationId) {
      query.where('a.organizationId', options.organizationId)
    }

    const eventType = options.eventType?.trim()
    if (eventType) {
      if (!catalogSet.has(eventType)) {
        return this.withFacets([], options)
      }
      query.where('a.eventType', eventType)
    }

    const actorUserId = options.actorUserId?.trim()
    if (actorUserId) {
      query.where('a.actorUserId', actorUserId)
    }

    const targetType = options.targetType?.trim()
    if (targetType) {
      query.where('a.targetType', targetType)
    }

    if (options.dateFrom) {
      query.where('a.createdAt', '>=', toInclusiveStart(options.dateFrom))
    }

    if (options.dateTo) {
      query.where('a.createdAt', '<=', toInclusiveEnd(options.dateTo))
    }

    const search = options.search?.trim()
    if (search) {
      const pattern = escapeIlike(search)
      query.where((builder) => {
        builder
          .whereILike('a.eventType', pattern)
          .orWhereILike('a.reason', pattern)
          .orWhereILike('a.targetType', pattern)
          .orWhereRaw('CAST(a."targetId" AS TEXT) ILIKE ?', [pattern])
          .orWhereRaw('CAST(a."actorUserId" AS TEXT) ILIKE ?', [pattern])
          .orWhereILike('u.name', pattern)
          .orWhereILike('u.email', pattern)
        if (options.scope === 'platform') {
          builder
            .orWhereRaw('CAST(a."organizationId" AS TEXT) ILIKE ?', [pattern])
            .orWhereILike('o.name', pattern)
        }
      })
    }

    const rows = await query.orderBy('a.createdAt', 'desc').limit(limit)
    const events = rows.map((row) => this.mapRow(row))
    return this.withFacets(events, options)
  }

  protected mapRow(r: Record<string, unknown>) {
    return {
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
    }
  }

  protected async withFacets(
    events: ReturnType<AuditService['mapRow']>[],
    options: ListAuditEventsOptions
  ): Promise<AuditListResult> {
    if (!options.includeFacets) {
      return { events }
    }

    const catalog = eventTypesForScope(options.scope)
    const facetsQuery = db
      .from('authorization_audits as a')
      .leftJoin('users as u', 'u.id', 'a.actorUserId')
      .whereIn('a.eventType', [...catalog])

    if (options.organizationId) {
      facetsQuery.where('a.organizationId', options.organizationId)
    }

    const [actorRows, targetRows] = await Promise.all([
      facetsQuery
        .clone()
        .whereNotNull('a.actorUserId')
        .select('a.actorUserId as id', db.raw('u.name as "name"'), db.raw('u.email as "email"'))
        .groupBy('a.actorUserId', 'u.name', 'u.email')
        .orderBy('u.name', 'asc'),
      facetsQuery.clone().distinct('a.targetType').orderBy('a.targetType', 'asc'),
    ])

    return {
      events,
      eventTypes: [...catalog],
      actors: actorRows.map((row) => ({
        id: row.id as string,
        name: (row.name as string | null) ?? null,
        email: (row.email as string | null) ?? null,
      })),
      targetTypes: targetRows
        .map((row) => row.targetType as string)
        .filter((value) => Boolean(value)),
    }
  }
}
