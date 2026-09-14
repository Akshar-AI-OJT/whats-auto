import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export type IntegrationConnectionProvider = 'shopenup' | 'custom'
export type IntegrationConnectionStatus = 'connected' | 'disconnected' | 'error'

export type IntegrationConnectionRow = {
  id: string
  organizationId: string
  provider: string
  externalAccountId: string | null
  displayName: string
  encryptedSecret: string | null
  config: Record<string, unknown>
  status: string
  lastSyncAt: Date | string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type UpsertIntegrationConnectionParams = {
  organizationId: string
  provider: IntegrationConnectionProvider
  displayName: string
  externalAccountId?: string | null
  encryptedSecret?: string | null
  config?: Record<string, unknown>
  status?: IntegrationConnectionStatus
}

type Db = typeof db | TransactionClientContract

function mapConfig(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }
  return {}
}

function mapRow(row: Record<string, unknown>): IntegrationConnectionRow {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    provider: String(row.provider),
    externalAccountId: (row.externalAccountId as string | null) ?? null,
    displayName: String(row.displayName),
    encryptedSecret: (row.encryptedSecret as string | null) ?? null,
    config: mapConfig(row.config),
    status: String(row.status),
    lastSyncAt: (row.lastSyncAt as Date | string | null) ?? null,
    lastErrorCode: (row.lastErrorCode as string | null) ?? null,
    lastErrorMessage: (row.lastErrorMessage as string | null) ?? null,
    createdAt: row.createdAt as Date | string,
    updatedAt: (row.updatedAt as Date | string | null) ?? null,
  }
}

/**
 * Tenant-scoped integration_connections. Callers must run inside runWithTenant.
 */
export class IntegrationConnectionRepository {
  async listForOrg(organizationId: string, client: Db = db): Promise<IntegrationConnectionRow[]> {
    const rows = await client
      .from('integration_connections')
      .where('organizationId', organizationId)
      .orderBy('provider', 'asc')
    return rows.map((row) => mapRow(row as Record<string, unknown>))
  }

  async findByProviderForOrg(
    params: { organizationId: string; provider: IntegrationConnectionProvider },
    client: Db = db
  ): Promise<IntegrationConnectionRow | null> {
    const row = await client
      .from('integration_connections')
      .where('organizationId', params.organizationId)
      .where('provider', params.provider)
      .first()
    return row ? mapRow(row as Record<string, unknown>) : null
  }

  async upsertForOrg(
    params: UpsertIntegrationConnectionParams,
    client: Db = db
  ): Promise<IntegrationConnectionRow> {
    const existing = await this.findByProviderForOrg(
      { organizationId: params.organizationId, provider: params.provider },
      client
    )

    if (existing) {
      const [row] = await client
        .from('integration_connections')
        .where('id', existing.id)
        .where('organizationId', params.organizationId)
        .update({
          displayName: params.displayName,
          externalAccountId: params.externalAccountId ?? existing.externalAccountId,
          encryptedSecret:
            params.encryptedSecret === undefined
              ? existing.encryptedSecret
              : params.encryptedSecret,
          config: params.config ?? existing.config,
          status: params.status ?? existing.status,
          updatedAt: new Date(),
        })
        .returning('*')
      return mapRow(row as Record<string, unknown>)
    }

    const [row] = await client
      .table('integration_connections')
      .insert({
        organizationId: params.organizationId,
        provider: params.provider,
        displayName: params.displayName,
        externalAccountId: params.externalAccountId ?? null,
        encryptedSecret: params.encryptedSecret ?? null,
        config: params.config ?? {},
        status: params.status ?? 'connected',
      })
      .returning('*')
    return mapRow(row as Record<string, unknown>)
  }

  async deleteByProviderForOrg(
    params: { organizationId: string; provider: IntegrationConnectionProvider },
    client: Db = db
  ): Promise<boolean> {
    const deleted = await client
      .from('integration_connections')
      .where('organizationId', params.organizationId)
      .where('provider', params.provider)
      .delete()
    return Number(deleted) > 0
  }
}
