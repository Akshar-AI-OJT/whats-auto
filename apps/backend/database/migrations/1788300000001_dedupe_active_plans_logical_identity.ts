import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'
import {
  CREATE_PLANS_ACTIVE_LOGICAL_IDENTITY_INDEX_SQL,
  DROP_PLANS_ACTIVE_LOGICAL_IDENTITY_INDEX_SQL,
} from '#lib/billing/plan_logical_identity'
import {
  cleanupDuplicateActivePlans,
  previewDuplicateActivePlanGroups,
} from '#services/billing/plan_duplicate_cleanup'

/**
 * 1. Collapse duplicate *active* plan SKUs (same name + interval + price + currency).
 *    Canonical row is the one with the most billing references; extras are archived
 *    (not hard-deleted) after subscriptions, billing orders, and invoices are
 *    re-pointed onto the canonical planId. Invoice snapshot fields (planName,
 *    totals) remain unchanged.
 * 2. Enforce that uniqueness going forward with a partial unique index on active rows.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async () => {
      const result = await db.transaction(async (trx) => {
        await trx.rawQuery('SET LOCAL row_security = off')
        const preview = await previewDuplicateActivePlanGroups(trx)
        if (preview.length > 0) {
          console.info('[plans] duplicate active groups before cleanup', preview)
        }
        const cleaned = await cleanupDuplicateActivePlans(trx)
        await trx.rawQuery(CREATE_PLANS_ACTIVE_LOGICAL_IDENTITY_INDEX_SQL)
        return cleaned
      })

      if (result.groups.length > 0) {
        console.info('[plans] archived duplicate active plans', result.groups)
      }
    })
  }

  async down() {
    this.defer(async () => {
      await db.rawQuery(DROP_PLANS_ACTIVE_LOGICAL_IDENTITY_INDEX_SQL)
    })
  }
}
