import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import mail from '@adonisjs/mail/services/main'
import db from '@adonisjs/lucid/services/db'
import type { OrganizationSmtpProviderPreset } from '#enums/organization_smtp_provider_preset'
import { SMTP_ONLY_PROVIDER_PRESETS } from '#enums/organization_smtp_provider_preset'
import { OrganizationSmtpStatus } from '#enums/organization_smtp_status'
import { OrganizationSmtpTransport } from '#enums/organization_smtp_transport'
import OrganizationSmtpException from '#exceptions/organization_smtp_exception'
import { insertAuthorizationAudit } from '#lib/authorization_audit'
import { decryptIntegrationSecret, encryptIntegrationSecret } from '#lib/integrations/secret_crypto'
import {
  OrganizationSmtpConfigRepository,
  type OrganizationSmtpConfigRow,
} from '#repositories/organization_smtp_config_repository'
import { orgApiTransport } from '#services/mail/org_api_transport'
import { orgSmtpTransport } from '#services/mail/org_smtp_transport'
import type {
  OrgMailTransport,
  OrgMailTransportConfig,
  SendOrgEmailParams,
  SendOrgEmailResult,
  SmtpEmailRetryJobData,
} from '#services/mail/org_mail_types'
import { MAX_SMTP_RETRY_ATTEMPTS, SMTP_RETRY_DELAYS_MS } from '#services/mail/org_mail_types'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { NotificationService } from '#services/notification_service'

export type UpsertOrganizationSmtpInput = {
  transport: OrganizationSmtpTransport
  providerPreset: OrganizationSmtpProviderPreset
  senderName: string
  senderEmail: string
  host?: string | null
  port?: number | null
  secure?: boolean | null
  username?: string | null
  password?: string | null
  apiKey?: string | null
}

export type DraftOrganizationSmtpInput = Partial<UpsertOrganizationSmtpInput>

export class OrganizationSmtpService {
  constructor(
    private configs: OrganizationSmtpConfigRepository = new OrganizationSmtpConfigRepository(),
    private smtpTransport: OrgMailTransport = orgSmtpTransport,
    private apiTransport: OrgMailTransport = orgApiTransport
  ) {}

  async getConfig(organizationId: string): Promise<OrganizationSmtpConfigRow | null> {
    return this.configs.findByOrgId(organizationId)
  }

  async upsertConfig(params: {
    organizationId: string
    actorUserId: string
    data: UpsertOrganizationSmtpInput
  }): Promise<OrganizationSmtpConfigRow> {
    const existing = await this.configs.findByOrgId(params.organizationId)
    const merged = this.mergeSecrets(params.data, existing)
    this.assertTransportPreset(merged)

    const transportConfig = this.toTransportConfig(merged)
    await this.verifyTransport(transportConfig)

    const saved = await this.configs.upsertForOrg({
      organizationId: params.organizationId,
      transport: merged.transport,
      providerPreset: merged.providerPreset,
      senderName: merged.senderName,
      senderEmail: merged.senderEmail,
      host: merged.transport === OrganizationSmtpTransport.SMTP ? (merged.host ?? null) : null,
      port: merged.transport === OrganizationSmtpTransport.SMTP ? (merged.port ?? null) : null,
      secure: merged.transport === OrganizationSmtpTransport.SMTP ? (merged.secure ?? null) : null,
      username:
        merged.transport === OrganizationSmtpTransport.SMTP ? (merged.username ?? null) : null,
      passwordEncrypted:
        merged.transport === OrganizationSmtpTransport.SMTP
          ? encryptIntegrationSecret(merged.password!)
          : null,
      apiKeyEncrypted:
        merged.transport === OrganizationSmtpTransport.API
          ? encryptIntegrationSecret(merged.apiKey!)
          : null,
      status: OrganizationSmtpStatus.VERIFIED,
      lastTestedAt: new Date(),
      lastErrorMessage: null,
    })

    await insertAuthorizationAudit({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      targetType: 'organization_smtp_config',
      targetId: saved.id,
      eventType: existing ? 'smtp_config.updated' : 'smtp_config.created',
      after: this.auditSnapshot(saved),
    })

    return saved
  }

  async deleteConfig(params: { organizationId: string; actorUserId: string }): Promise<void> {
    const existing = await this.configs.findByOrgId(params.organizationId)
    if (!existing) {
      throw OrganizationSmtpException.configNotFound()
    }

    await this.configs.deleteForOrg(params.organizationId)

    await insertAuthorizationAudit({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      targetType: 'organization_smtp_config',
      targetId: existing.id,
      eventType: 'smtp_config.deleted',
      before: this.auditSnapshot(existing),
    })
  }

  async testConnection(params: {
    organizationId: string
    actorUserId: string
    userEmail: string
    draftConfig?: DraftOrganizationSmtpInput
  }): Promise<void> {
    const existing = await this.configs.findByOrgId(params.organizationId)
    const merged = params.draftConfig
      ? this.mergeSecrets(
          { ...this.requireDraftBase(params.draftConfig), ...params.draftConfig },
          existing
        )
      : existing
        ? this.rowToInput(existing)
        : null

    if (!merged) {
      throw OrganizationSmtpException.configNotFound()
    }

    this.assertTransportPreset(merged)
    const transportConfig = this.toTransportConfig(merged)
    await this.verifyTransport(transportConfig)

    const testMessage = {
      fromName: merged.senderName,
      fromEmail: merged.senderEmail,
      to: params.userEmail,
      subject: 'Whats-Auto SMTP test email',
      html: '<p>Your organization SMTP configuration is working.</p>',
      text: 'Your organization SMTP configuration is working.',
    }

    await this.sendWithTransport(merged.transport, transportConfig, testMessage)

    if (!params.draftConfig && existing) {
      await this.configs.updateStatus({
        organizationId: params.organizationId,
        status: OrganizationSmtpStatus.VERIFIED,
        lastTestedAt: new Date(),
        lastErrorMessage: null,
      })

      await insertAuthorizationAudit({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        targetType: 'organization_smtp_config',
        targetId: existing.id,
        eventType: 'smtp_config.test_sent',
        after: { to: params.userEmail },
      })
    }
  }

  async sendOrgEmail(params: SendOrgEmailParams): Promise<SendOrgEmailResult> {
    const configRow = await this.configs.findByOrgId(params.organizationId)

    if (!configRow) {
      await mail.send((message) => {
        message.to(params.to).subject(params.subject).html(params.html)
        if (params.text) {
          message.text(params.text)
        }
      })
      return { deferred: false }
    }

    const input = this.rowToInput(configRow)
    const transportConfig = this.toTransportConfig(input)

    try {
      await this.sendWithTransport(configRow.transport, transportConfig, {
        fromName: input.senderName,
        fromEmail: input.senderEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      })
      await this.configs.updateStatus({
        organizationId: params.organizationId,
        status: OrganizationSmtpStatus.VERIFIED,
        lastErrorMessage: null,
      })
      return { deferred: false }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logger.warn(
        { organizationId: params.organizationId, to: params.to, err: reason },
        'org_smtp.send_failed_enqueue_retry'
      )
      await this.enqueueRetry({
        organizationId: params.organizationId,
        attempt: 1,
        emailKind: params.emailKind ?? 'generic',
        invitationId: params.invitationId,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      })
      return { deferred: true }
    }
  }

  async deliverRetryJob(data: SmtpEmailRetryJobData): Promise<void> {
    const configRow = await this.configs.findByOrgId(data.organizationId)
    if (!configRow) {
      logger.warn(
        { organizationId: data.organizationId, attempt: data.attempt },
        'org_smtp.retry_aborted_config_deleted'
      )
      return
    }

    const input = this.rowToInput(configRow)
    const transportConfig = this.toTransportConfig(input)

    try {
      await this.sendWithTransport(configRow.transport, transportConfig, {
        fromName: input.senderName,
        fromEmail: input.senderEmail,
        to: data.to,
        subject: data.subject,
        html: data.html,
        text: data.text,
      })
      await this.configs.updateStatus({
        organizationId: data.organizationId,
        status: OrganizationSmtpStatus.VERIFIED,
        lastErrorMessage: null,
      })
      return
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)

      if (data.attempt < MAX_SMTP_RETRY_ATTEMPTS) {
        await this.enqueueRetry({ ...data, attempt: data.attempt + 1 })
        return
      }

      await this.configs.updateStatus({
        organizationId: data.organizationId,
        status: OrganizationSmtpStatus.FAILED,
        lastErrorMessage: reason,
      })

      if (data.emailKind === 'invitation' && data.invitationId) {
        await db.from('organization_invitations').where('id', data.invitationId).delete()
        await this.notifyAdminsSmtpFailure({
          organizationId: data.organizationId,
          reason,
        })
      }
    }
  }

  private async enqueueRetry(data: SmtpEmailRetryJobData): Promise<void> {
    const delayMs = SMTP_RETRY_DELAYS_MS[data.attempt - 1]
    if (!delayMs) {
      throw new Error(`Invalid SMTP retry attempt ${data.attempt}`)
    }

    const manager = await app.container.make(JobQueueManager)
    const driver = await manager.ensureStarted()
    await driver.enqueue(JOB_NAMES.SMTP_EMAIL_RETRY, data as unknown as Record<string, unknown>, {
      runAt: new Date(Date.now() + delayMs),
    })
  }

  private async notifyAdminsSmtpFailure(params: {
    organizationId: string
    reason: string
  }): Promise<void> {
    const admins = await db
      .from('organization_members as om')
      .join('roles as r', 'r.id', 'om.roleId')
      .where('om.organizationId', params.organizationId)
      .where('om.isDeleted', false)
      .whereIn('r.name', ['owner', 'admin'])
      .select('om.userId')

    const notificationService = new NotificationService()
    for (const admin of admins) {
      await notificationService.createNotification({
        organizationId: params.organizationId,
        userId: admin.userId as string,
        type: 'smtp_delivery_failed',
        title: 'Invitation email failed',
        body: `Team invitation email could not be delivered after multiple attempts. ${params.reason}`,
      })
    }
  }

  private mergeSecrets(
    input: UpsertOrganizationSmtpInput,
    existing: OrganizationSmtpConfigRow | null
  ): UpsertOrganizationSmtpInput {
    if (input.transport === OrganizationSmtpTransport.SMTP) {
      const password =
        input.password?.trim() ||
        (existing?.passwordEncrypted ? decryptIntegrationSecret(existing.passwordEncrypted) : null)
      if (!password) {
        throw OrganizationSmtpException.connectionFailed('Password is required')
      }
      return { ...input, password, apiKey: null }
    }

    const apiKey =
      input.apiKey?.trim() ||
      (existing?.apiKeyEncrypted ? decryptIntegrationSecret(existing.apiKeyEncrypted) : null)
    if (!apiKey) {
      throw OrganizationSmtpException.connectionFailed('API key is required')
    }
    return { ...input, apiKey, password: null }
  }

  private requireDraftBase(draft: DraftOrganizationSmtpInput): UpsertOrganizationSmtpInput {
    if (!draft.transport || !draft.providerPreset || !draft.senderName || !draft.senderEmail) {
      throw OrganizationSmtpException.connectionFailed(
        'Draft config requires transport, providerPreset, senderName, and senderEmail'
      )
    }
    return draft as UpsertOrganizationSmtpInput
  }

  private assertTransportPreset(input: UpsertOrganizationSmtpInput) {
    if (
      input.transport === OrganizationSmtpTransport.API &&
      SMTP_ONLY_PROVIDER_PRESETS.has(input.providerPreset)
    ) {
      throw OrganizationSmtpException.invalidTransportForPreset(
        input.providerPreset,
        input.transport
      )
    }
  }

  private rowToInput(row: OrganizationSmtpConfigRow): UpsertOrganizationSmtpInput {
    return {
      transport: row.transport as OrganizationSmtpTransport,
      providerPreset: row.providerPreset as OrganizationSmtpProviderPreset,
      senderName: row.senderName,
      senderEmail: row.senderEmail,
      host: row.host,
      port: row.port,
      secure: row.secure,
      username: row.username,
      password: row.passwordEncrypted ? decryptIntegrationSecret(row.passwordEncrypted) : null,
      apiKey: row.apiKeyEncrypted ? decryptIntegrationSecret(row.apiKeyEncrypted) : null,
    }
  }

  private toTransportConfig(input: UpsertOrganizationSmtpInput): OrgMailTransportConfig {
    return {
      transport: input.transport,
      providerPreset: input.providerPreset,
      senderName: input.senderName,
      senderEmail: input.senderEmail,
      host: input.host,
      port: input.port,
      secure: input.secure,
      username: input.username,
      password: input.password,
      apiKey: input.apiKey,
    }
  }

  private async verifyTransport(config: OrgMailTransportConfig): Promise<void> {
    try {
      const transport =
        config.transport === OrganizationSmtpTransport.API ? this.apiTransport : this.smtpTransport
      await transport.verify(config)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw OrganizationSmtpException.connectionFailed(reason)
    }
  }

  private async sendWithTransport(
    transportType: string,
    config: OrgMailTransportConfig,
    message: {
      fromName: string
      fromEmail: string
      to: string
      subject: string
      html: string
      text?: string
    }
  ): Promise<void> {
    const transport =
      transportType === OrganizationSmtpTransport.API ? this.apiTransport : this.smtpTransport
    await transport.send(config, message)
  }

  private auditSnapshot(row: OrganizationSmtpConfigRow) {
    return {
      transport: row.transport,
      providerPreset: row.providerPreset,
      senderEmail: row.senderEmail,
      status: row.status,
    }
  }
}
