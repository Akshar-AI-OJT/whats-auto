import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export type AuthorizationAuditInsert = {
  organizationId?: string | null
  actorUserId?: string | null
  roleId?: string | null
  permissionId?: string | null
  targetType: string
  targetId?: string | null
  eventType: string
  granted?: boolean | null
  before?: unknown
  after?: unknown
  reason?: string | null
}

export async function insertAuthorizationAudit(
  payload: AuthorizationAuditInsert,
  trx?: TransactionClientContract
): Promise<void> {
  const client = trx ?? db
  await client.table('authorization_audits').insert({
    organizationId: payload.organizationId ?? null,
    actorUserId: payload.actorUserId ?? null,
    roleId: payload.roleId ?? null,
    permissionId: payload.permissionId ?? null,
    targetType: payload.targetType,
    targetId: payload.targetId ?? null,
    eventType: payload.eventType,
    granted: payload.granted ?? null,
    before: payload.before !== null ? JSON.stringify(payload.before) : null,
    after: payload.after !== null ? JSON.stringify(payload.after) : null,
    reason: payload.reason ?? null,
  })
}
