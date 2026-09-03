import db from '@adonisjs/lucid/services/db'
import {
  CREATE_PLANS_ACTIVE_LOGICAL_IDENTITY_INDEX_SQL,
  DROP_PLANS_ACTIVE_LOGICAL_IDENTITY_INDEX_SQL,
} from '#lib/billing/plan_logical_identity'

/**
 * Temporarily drop the active-plan identity index so tests can insert legacy
 * duplicate rows. Serialized with an advisory lock so parallel files cannot
 * leave the catalog without uniqueness protection.
 */
export async function withActivePlanIdentityIndexDropped<T>(run: () => Promise<T>): Promise<T> {
  await db.rawQuery('SELECT pg_advisory_lock(1788300001)')
  await db.rawQuery(DROP_PLANS_ACTIVE_LOGICAL_IDENTITY_INDEX_SQL)
  try {
    return await run()
  } finally {
    await db.rawQuery(CREATE_PLANS_ACTIVE_LOGICAL_IDENTITY_INDEX_SQL)
    await db.rawQuery('SELECT pg_advisory_unlock(1788300001)')
  }
}
