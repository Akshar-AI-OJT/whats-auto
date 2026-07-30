import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'
import { WhatsappConfigService } from '#services/whatsapp_config_service'

/**
 * Dev-only: seed a whatsapp_configs row without running Embedded Signup.
 *
 * Use the test business number from App Dashboard > WhatsApp > API Setup
 * (phone number id, WABA id, and the temporary or system-user token).
 * The token is encrypted through the same path as the real flow.
 */
export default class WhatsappSeedConfig extends BaseCommand {
  static commandName = 'whatsapp:seed-config'
  static description = 'Seed a WhatsApp config row from Meta API Setup credentials (dev only)'
  static options: CommandOptions = { startApp: true }

  @flags.string({ flagName: 'org', description: 'Organization UUID' })
  declare org: string

  @flags.string({ flagName: 'phone-number-id', description: 'Meta business phone number ID' })
  declare phoneNumberId: string

  @flags.string({ flagName: 'waba-id', description: 'WhatsApp Business Account ID' })
  declare wabaId: string

  @flags.string({ flagName: 'token', description: 'Plaintext Meta access token' })
  declare token: string

  @flags.string({
    flagName: 'user',
    description: 'Creator user UUID (defaults to the organization owner)',
  })
  declare user?: string

  async run() {
    const missing = (['org', 'phoneNumberId', 'wabaId', 'token'] as const).filter((f) => !this[f])
    if (missing.length) {
      this.logger.error(`Missing required flags: ${missing.join(', ')}`)
      this.exitCode = 1
      return
    }

    const userId = this.user ?? (await this.resolveOwnerUserId())
    if (!userId) {
      this.logger.error('Could not resolve an owner for this organization, pass --user')
      this.exitCode = 1
      return
    }

    const config = await new WhatsappConfigService().upsertFromEmbeddedSignup({
      organizationId: this.org,
      userId,
      phoneNumberId: this.phoneNumberId,
      wabaId: this.wabaId,
      accessTokenPlain: this.token,
      status: 'connected',
      subscribed: true,
      registered: true,
    })

    this.logger.success(`Seeded WhatsApp config ${config.id}`)
  }

  private async resolveOwnerUserId(): Promise<string | undefined> {
    const row = await db
      .from('organization_members')
      .join('roles', 'roles.id', 'organization_members.roleId')
      .where('organization_members.organizationId', this.org)
      .where('roles.name', 'owner')
      .select('organization_members.userId')
      .first()

    return row?.userId
  }
}
