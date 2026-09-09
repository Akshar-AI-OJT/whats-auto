import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { grantSuperadminRole } from '#services/grant_superadmin_service'

/**
 * Restore the global superadmin grant for an existing user.
 *
 * Prefer `node bin/grant_superadmin.js` in production migrate scripts — it
 * boots the app without scanning every Ace command.
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
    const result = await grantSuperadminRole({
      email: this.email ?? process.env.SUPERADMIN_EMAIL,
      force: this.force,
    })

    if (result.level === 'success') {
      this.logger.success(result.message)
    } else if (result.level === 'warning') {
      this.logger.warning(result.message)
    } else {
      this.logger.error(result.message)
    }

    if (!result.ok) {
      this.exitCode = 1
    }
  }
}
