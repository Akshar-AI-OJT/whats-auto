import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'

/**
 * Restore the global superadmin grant for an existing user.
 *
 * Use when bootstrap already ran but the platform admin lost superadmin
 * (e.g. a bad invite/role assignment). The bootstrap seeder cannot fix this:
 * it no-ops if any superadmin grant exists, and refuses to create a user
 * when SUPERADMIN_EMAIL already has an account.
 *
 * Reads SUPERADMIN_EMAIL when --email is omitted.
 */
export default class GrantSuperadmin extends BaseCommand {
  static commandName = 'superadmin:grant'
  static description = 'Grant or restore the global superadmin role for an existing user'
  static options: CommandOptions = { startApp: true }

  @flags.string({
    flagName: 'email',
    description: 'User email (defaults to SUPERADMIN_EMAIL env)',
  })
  declare email?: string

  @flags.boolean({
    flagName: 'force',
    description: 'Revoke superadmin from other users and grant to this email',
  })
  declare force: boolean

  async run() {
    const email = (this.email ?? process.env.SUPERADMIN_EMAIL)?.trim().toLowerCase()
    if (!email) {
      this.logger.error('Pass --email or set SUPERADMIN_EMAIL in the environment')
      this.exitCode = 1
      return
    }

    const user = await db
      .from('users')
      .whereRaw('LOWER(email) = ?', [email])
      .where('isDeleted', false)
      .select('id', 'email')
      .first()

    if (!user) {
      this.logger.error(`No active user found for "${email}"`)
      this.exitCode = 1
      return
    }

    const superadminRole = await db
      .from('roles')
      .whereNull('organizationId')
      .where('name', 'superadmin')
      .select('id')
      .first()

    if (!superadminRole) {
      this.logger.error('Superadmin role missing — run rbac_seeder first')
      this.exitCode = 1
      return
    }

    const existingHolder = await db
      .from('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.roleId')
      .innerJoin('users as u', 'u.id', 'ur.userId')
      .whereNull('ur.organizationId')
      .where('r.name', 'superadmin')
      .where('u.isDeleted', false)
      .select('ur.userId', 'u.email')
      .first()

    if (existingHolder && existingHolder.userId !== user.id) {
      if (!this.force) {
        this.logger.error(
          `Superadmin is already granted to "${existingHolder.email}". ` +
            'Pass --force to move the grant to the requested email.'
        )
        this.exitCode = 1
        return
      }

      await db
        .from('user_roles')
        .where('userId', existingHolder.userId)
        .whereNull('organizationId')
        .delete()

      this.logger.warning(`Revoked superadmin from "${existingHolder.email}"`)
    }

    const globalGrant = await db
      .from('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.roleId')
      .where('ur.userId', user.id)
      .whereNull('ur.organizationId')
      .select('ur.id', 'r.name', 'ur.permissionVersion')
      .first()

    if (globalGrant?.name === 'superadmin') {
      this.logger.success(`"${email}" already has the global superadmin role`)
      return
    }

    if (globalGrant) {
      await db
        .from('user_roles')
        .where('id', globalGrant.id)
        .update({
          roleId: superadminRole.id,
          permissionVersion: Number(globalGrant.permissionVersion) + 1,
        })

      this.logger.success(
        `Updated global grant for "${email}" from "${globalGrant.name}" to superadmin`
      )
      return
    }

    await db.table('user_roles').insert({
      userId: user.id,
      roleId: superadminRole.id,
      organizationId: null,
      permissionVersion: 1,
    })

    this.logger.success(`Granted global superadmin to "${email}"`)
  }
}
