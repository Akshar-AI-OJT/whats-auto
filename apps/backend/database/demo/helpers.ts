import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * Ace seeders are not covered by TenantRlsProvider's pool patch.
 * Stamp the tenant GUC on the transaction connection so RLS WITH CHECK passes.
 */
export async function withTenantWrite<T>(
  organizationId: string,
  fn: (trx: TransactionClientContract) => Promise<T>
): Promise<T> {
  return db.transaction(async (trx) => {
    await trx.rawQuery(`SELECT set_config('app.current_organization_id', ?, true)`, [
      organizationId,
    ])
    return fn(trx)
  })
}

/** Upsert a row by primary key id (insert or merge all provided columns). */
export async function upsertById(
  table: string,
  id: string,
  row: Record<string, unknown>,
  trx?: TransactionClientContract
) {
  const client = trx ?? db
  const payload: Record<string, unknown> = { id, ...row }
  const existing = await client.from(table).where('id', id).select('id').first()
  if (existing) {
    const update = { ...payload }
    delete update.id
    delete update.createdAt
    if (Object.keys(update).length > 0) {
      await client.from(table).where('id', id).update(update)
    }
    return
  }
  await client.table(table).insert(payload)
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function daysFromNow(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

export function daysAgo(days: number): string {
  return daysFromNow(-days)
}

export function hoursAgo(hours: number): string {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() - hours)
  return d.toISOString()
}

/** Serialize value for PostgreSQL jsonb columns via knex inserts. */
export function jsonb(value: unknown): string {
  return JSON.stringify(value)
}
