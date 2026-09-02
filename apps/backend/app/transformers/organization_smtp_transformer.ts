import type { OrganizationSmtpConfigRow } from '#repositories/organization_smtp_config_repository'

export type OrganizationSmtpResponse = {
  id: string
  organizationId: string
  transport: string
  providerPreset: string
  senderName: string
  senderEmail: string
  host: string | null
  port: number | null
  secure: boolean | null
  username: string | null
  status: string
  lastTestedAt: string | null
  lastErrorMessage: string | null
  hasPassword: boolean
  hasApiKey: boolean
  createdAt: string
  updatedAt: string | null
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function transformOrganizationSmtp(
  row: OrganizationSmtpConfigRow
): OrganizationSmtpResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    transport: row.transport,
    providerPreset: row.providerPreset,
    senderName: row.senderName,
    senderEmail: row.senderEmail,
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    status: row.status,
    lastTestedAt: toIso(row.lastTestedAt),
    lastErrorMessage: row.lastErrorMessage,
    hasPassword: Boolean(row.passwordEncrypted),
    hasApiKey: Boolean(row.apiKeyEncrypted),
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt),
  }
}
