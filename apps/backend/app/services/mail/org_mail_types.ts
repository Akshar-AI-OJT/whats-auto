import type { OrganizationSmtpProviderPresetValue } from '#enums/organization_smtp_provider_preset'
import type { OrganizationSmtpTransportValue } from '#enums/organization_smtp_transport'

export type OrgMailSendParams = {
  fromName: string
  fromEmail: string
  to: string
  subject: string
  html: string
  text?: string
}

export type OrgMailTransportConfig = {
  transport: OrganizationSmtpTransportValue
  providerPreset: OrganizationSmtpProviderPresetValue
  senderName: string
  senderEmail: string
  host?: string | null
  port?: number | null
  secure?: boolean | null
  username?: string | null
  password?: string | null
  apiKey?: string | null
}

export type OrgMailTransport = {
  verify(config: OrgMailTransportConfig): Promise<void>
  send(config: OrgMailTransportConfig, message: OrgMailSendParams): Promise<void>
}

export type SendOrgEmailParams = {
  organizationId: string
  to: string
  subject: string
  html: string
  text?: string
  emailKind?: 'invitation' | 'generic'
  invitationId?: string
}

export type SendOrgEmailResult = {
  /** True when delivery was deferred to the retry queue (custom org mail only). */
  deferred: boolean
}

export const SMTP_RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000] as const

export const MAX_SMTP_RETRY_ATTEMPTS = SMTP_RETRY_DELAYS_MS.length

export type SmtpEmailRetryJobData = {
  organizationId: string
  attempt: number
  emailKind: 'invitation' | 'generic'
  invitationId?: string
  to: string
  subject: string
  html: string
  text?: string
}
