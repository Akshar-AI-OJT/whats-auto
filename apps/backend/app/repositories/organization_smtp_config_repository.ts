import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { OrganizationSmtpStatusValue } from '#enums/organization_smtp_status'
import type { OrganizationSmtpTransportValue } from '#enums/organization_smtp_transport'
import type { OrganizationSmtpProviderPresetValue } from '#enums/organization_smtp_provider_preset'

export type OrganizationSmtpConfigRow = {
  id: string
  organizationId: string
  transport: OrganizationSmtpTransportValue
  providerPreset: OrganizationSmtpProviderPresetValue
  senderName: string
  senderEmail: string
  host: string | null
  port: number | null
  secure: boolean | null
  username: string | null
  passwordEncrypted: string | null
  apiKeyEncrypted: string | null
  status: OrganizationSmtpStatusValue
  lastTestedAt: Date | string | null
  lastErrorMessage: string | null
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type UpsertOrganizationSmtpConfigParams = {
  organizationId: string
  transport: OrganizationSmtpTransportValue
  providerPreset: OrganizationSmtpProviderPresetValue
  senderName: string
  senderEmail: string
  host?: string | null
  port?: number | null
  secure?: boolean | null
  username?: string | null
  passwordEncrypted?: string | null
  apiKeyEncrypted?: string | null
  status: OrganizationSmtpStatusValue
  lastTestedAt?: Date | null
  lastErrorMessage?: string | null
}

type Db = typeof db | TransactionClientContract

function mapRow(row: Record<string, unknown>): OrganizationSmtpConfigRow {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    transport: String(row.transport) as OrganizationSmtpTransportValue,
    providerPreset: String(row.providerPreset) as OrganizationSmtpProviderPresetValue,
    senderName: String(row.senderName),
    senderEmail: String(row.senderEmail),
    host: (row.host as string | null) ?? null,
    port: row.port === null || row.port === undefined ? null : Number(row.port),
    secure: row.secure === null || row.secure === undefined ? null : Boolean(row.secure),
    username: (row.username as string | null) ?? null,
    passwordEncrypted: (row.passwordEncrypted as string | null) ?? null,
    apiKeyEncrypted: (row.apiKeyEncrypted as string | null) ?? null,
    status: String(row.status) as OrganizationSmtpStatusValue,
    lastTestedAt: (row.lastTestedAt as Date | string | null) ?? null,
    lastErrorMessage: (row.lastErrorMessage as string | null) ?? null,
    createdAt: row.createdAt as Date | string,
    updatedAt: (row.updatedAt as Date | string | null) ?? null,
  }
}

/**
 * Tenant-scoped organization_smtp_configs. Callers must run inside runWithTenant.
 */
export class OrganizationSmtpConfigRepository {
  async findByOrgId(
    organizationId: string,
    client: Db = db
  ): Promise<OrganizationSmtpConfigRow | null> {
    const row = await client
      .from('organization_smtp_configs')
      .where('organizationId', organizationId)
      .first()
    return row ? mapRow(row as Record<string, unknown>) : null
  }

  async upsertForOrg(
    params: UpsertOrganizationSmtpConfigParams,
    client: Db = db
  ): Promise<OrganizationSmtpConfigRow> {
    const existing = await this.findByOrgId(params.organizationId, client)
    const now = new Date()

    const payload = {
      transport: params.transport,
      providerPreset: params.providerPreset,
      senderName: params.senderName,
      senderEmail: params.senderEmail,
      host: params.host ?? null,
      port: params.port ?? null,
      secure: params.secure ?? null,
      username: params.username ?? null,
      passwordEncrypted: params.passwordEncrypted ?? null,
      apiKeyEncrypted: params.apiKeyEncrypted ?? null,
      status: params.status,
      lastTestedAt: params.lastTestedAt ?? null,
      lastErrorMessage: params.lastErrorMessage ?? null,
      updatedAt: now,
    }

    if (existing) {
      const [row] = await client
        .from('organization_smtp_configs')
        .where('id', existing.id)
        .update(payload)
        .returning('*')
      return mapRow(row as Record<string, unknown>)
    }

    const [row] = await client
      .table('organization_smtp_configs')
      .insert({
        organizationId: params.organizationId,
        ...payload,
        createdAt: now,
      })
      .returning('*')
    return mapRow(row as Record<string, unknown>)
  }

  async deleteForOrg(organizationId: string, client: Db = db): Promise<boolean> {
    const deleted = await client
      .from('organization_smtp_configs')
      .where('organizationId', organizationId)
      .delete()
    return Number(deleted) > 0
  }

  async updateStatus(
    params: {
      organizationId: string
      status: OrganizationSmtpStatusValue
      lastErrorMessage?: string | null
      lastTestedAt?: Date | null
    },
    client: Db = db
  ): Promise<OrganizationSmtpConfigRow | null> {
    const [row] = await client
      .from('organization_smtp_configs')
      .where('organizationId', params.organizationId)
      .update({
        status: params.status,
        lastErrorMessage: params.lastErrorMessage ?? null,
        lastTestedAt: params.lastTestedAt ?? null,
        updatedAt: new Date(),
      })
      .returning('*')
    return row ? mapRow(row as Record<string, unknown>) : null
  }
}
