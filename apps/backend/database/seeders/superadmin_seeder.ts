import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import { bootstrapSuperadminUser } from '#services/grant_superadmin_service'

/**
 * Bootstraps the first platform superadmin in production.
 *
 * Idempotent: no-op when a global superadmin grant already exists.
 * Requires rbac_seeder to have run first (superadmin role row).
 */
export default class extends BaseSeeder {
  async run() {
    const existingGrant = await db
      .from('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.roleId')
      .whereNull('ur.organizationId')
      .where('r.name', 'superadmin')
      .select('ur.userId')
      .first()

    if (existingGrant) {
      return
    }

    const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase()
    if (!email) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'No platform superadmin exists and SUPERADMIN_EMAIL is not set. ' +
            'Set SUPERADMIN_EMAIL in deploy env and re-run migrate.'
        )
      }
      return
    }

    const result = await bootstrapSuperadminUser({ email })
    if (!result.ok) {
      throw new Error(result.message)
    }

    console.log(result.message)
  }
}
