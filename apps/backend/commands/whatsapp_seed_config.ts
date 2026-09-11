import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'
import { OrganizationStatus } from '#enums/organization_status'
import { runWithTenant } from '#services/tenant_context'
import { WhatsappConfigService } from '#services/whatsapp_config_service'

/**
 * Dev-only: seed a whatsapp_configs row without running Embedded Signup.
 *
 * Use the test business number from App Dashboard > WhatsApp > API Setup
 * (phone number id, WABA id, and the temporary or system-user token).
 * The token is encrypted through the same path as the real flow.
 *
 * Also writes D70 snapshot columns (`businessId`, `metaVerificationStatus=verified`)
 * and forces organizations.status to verified_setup (any live status). Pass
 * `--business-id` for the Meta Business Portfolio id.
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

  @flags.string({
    flagName: 'business-id',
    description: 'Meta Business Portfolio ID (whatsapp_configs.businessId)',
  })
  declare businessId?: string

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

    const businessId = this.businessId?.trim() || undefined

    const organizationStatus = await this.forceVerifiedSetup()
    if (this.exitCode === 1) {
      return
    }

    const config = await runWithTenant(this.org, async () =>
      new WhatsappConfigService().upsertFromEmbeddedSignup({
        organizationId: this.org,
        userId,
        phoneNumberId: this.phoneNumberId,
        wabaId: this.wabaId,
        accessTokenPlain: this.token,
        status: 'connected',
        subscribed: true,
        registered: true,
        ...(businessId !== undefined ? { businessId } : {}),
        metaVerificationStatus: 'verified',
      })
    )

    this.logger.success(
      `Seeded WhatsApp config ${config.id} (status=${config.status}, verification=${config.metaVerificationStatus}, businessId=${config.businessId ?? 'null'}, orgStatus=${organizationStatus})`
    )
    if (!config.businessId) {
      this.logger.warning(
        'businessId is null. Re-run with --business-id=<Meta portfolio id> if you need the D70 snapshot column filled.'
      )
    }
  }

  /**
   * Force organizations.status to verified_setup from any live status.
   * No-op when already verified_setup. Soft-deleted rows are not revived.
   */
  private async forceVerifiedSetup(): Promise<string> {
    const org = await db
      .from('organizations')
      .where('id', this.org)
      .whereNull('deletedAt')
      .select('status')
      .first()

    if (!org) {
      this.logger.error('Organization not found')
      this.exitCode = 1
      return 'missing'
    }

    const current = org.status as string
    if (current === OrganizationStatus.VERIFIED_SETUP) {
      this.logger.info(`organization status is ${current}; leaving it unchanged`)
      return current
    }

    await db
      .from('organizations')
      .where('id', this.org)
      .whereNull('deletedAt')
      .update({ status: OrganizationStatus.VERIFIED_SETUP })

    this.logger.info(`organization status ${current} → ${OrganizationStatus.VERIFIED_SETUP}`)
    return OrganizationStatus.VERIFIED_SETUP
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
