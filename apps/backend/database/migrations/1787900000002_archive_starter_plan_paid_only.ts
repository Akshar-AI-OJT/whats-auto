import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'

/**
 * LAST STEP of the provisioning gate: remove the free starter plan so new orgs
 * must pay. Migrates any org still on starter onto growth, archives starter,
 * and zeros trialDays on paid plans.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async () => {
      const starter = await db
        .from('plans')
        .where('code', 'starter')
        .select('id', 'metadata')
        .first()
      const growth = await db.from('plans').where('code', 'growth').select('id').first()

      if (starter?.id && growth?.id) {
        await db
          .from('organization_subscriptions')
          .where('planId', starter.id)
          .whereNot('status', 'cancelled')
          .update({ planId: growth.id })
      }

      if (starter?.id) {
        const meta =
          starter.metadata &&
          typeof starter.metadata === 'object' &&
          !Array.isArray(starter.metadata)
            ? { ...(starter.metadata as Record<string, unknown>) }
            : {}
        meta.status = 'archived'
        await db.from('plans').where('id', starter.id).update({
          isActive: false,
          metadata: meta,
        })
      }

      await db.from('plans').whereIn('code', ['growth', 'scale']).update({ trialDays: 0 })
    })
  }

  async down() {
    this.defer(async () => {
      const starter = await db
        .from('plans')
        .where('code', 'starter')
        .select('id', 'metadata')
        .first()
      if (starter?.id) {
        const meta =
          starter.metadata &&
          typeof starter.metadata === 'object' &&
          !Array.isArray(starter.metadata)
            ? { ...(starter.metadata as Record<string, unknown>) }
            : {}
        delete meta.status
        await db.from('plans').where('id', starter.id).update({
          isActive: true,
          metadata: meta,
        })
      }

      await db.from('plans').whereIn('code', ['growth', 'scale']).update({ trialDays: 14 })
    })
  }
}
