import { randomBytes, randomUUID } from 'node:crypto'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'

/**
 * Bootstraps the first platform superadmin in production.
 *
 * Idempotent: no-op when a global superadmin grant already exists.
 * Requires rbac_seeder to have run first (superadmin role row).
 *
 * Password is a one-time random value that is never logged. The operator sets
 * a real password via Forgot Password (mail must be configured).
 *
 * Env (required on first bootstrap in production):
 *   SUPERADMIN_EMAIL — login email for the platform admin
 * Optional:
 *   SUPERADMIN_FIRSTNAME (default: Platform)
 *   SUPERADMIN_LASTNAME (default: Admin)
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

    const liveUser = await db
      .from('users')
      .where('email', email)
      .where('isDeleted', false)
      .select('id')
      .first()

    if (liveUser) {
      throw new Error(
        `Cannot bootstrap superadmin: user "${email}" already exists. ` +
          'Use a fresh email or grant the superadmin role manually.'
      )
    }

    const superadminRole = await db
      .from('roles')
      .whereNull('organizationId')
      .where('name', 'superadmin')
      .select('id')
      .first()

    if (!superadminRole) {
      throw new Error('Superadmin role missing — run rbac_seeder first')
    }

    const firstname = process.env.SUPERADMIN_FIRSTNAME?.trim() || 'Platform'
    const lastname = process.env.SUPERADMIN_LASTNAME?.trim() || 'Admin'
    const name = `${firstname} ${lastname}`

    const randomPassword = randomBytes(32).toString('base64url')
    const passwordHash = await hash.make(randomPassword)

    const userId = randomUUID()

    await db.transaction(async (trx) => {
      await trx.table('users').insert({
        id: userId,
        name,
        firstname,
        lastname,
        email,
        emailVerified: true,
        isActive: true,
        isDeleted: false,
      })

      await trx.table('accounts').insert({
        userId,
        accountId: userId,
        providerId: 'credential',
        password: passwordHash,
      })

      await trx.table('user_roles').insert({
        userId,
        roleId: superadminRole.id as string,
        organizationId: null,
        permissionVersion: 1,
      })
    })

    console.log(
      `Platform superadmin created for ${email}. Use Forgot Password on the login page to set your password.`
    )
  }
}
