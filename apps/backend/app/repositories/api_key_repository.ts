import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export type ResolvedApiKey = {
  id: string
  organizationId: string
  scopes: string[]
  revokedAt: Date | string | null
  expiresAt: Date | string | null
}

export type ApiKeyRow = {
  id: string
  organizationId: string
  createdByUserId: string | null
  name: string
  keyPrefix: string
  keyHash: string
  scopes: string[]
  lastUsedAt: Date | string | null
  expiresAt: Date | string | null
  revokedAt: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type InsertApiKeyParams = {
  organizationId: string
  createdByUserId?: string | null
  name: string
  keyPrefix: string
  keyHash: string
  scopes: string[]
  expiresAt?: Date | null
}

type Db = typeof db | TransactionClientContract

function mapScopes(value: unknown): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value
  }
  return []
}

function mapResolved(row: Record<string, unknown>): ResolvedApiKey {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    scopes: mapScopes(row.scopes),
    revokedAt: (row.revokedAt as Date | string | null) ?? null,
    expiresAt: (row.expiresAt as Date | string | null) ?? null,
  }
}

function mapRow(row: Record<string, unknown>): ApiKeyRow {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    createdByUserId: (row.createdByUserId as string | null) ?? null,
    name: String(row.name),
    keyPrefix: String(row.keyPrefix),
    keyHash: String(row.keyHash),
    scopes: mapScopes(row.scopes),
    lastUsedAt: (row.lastUsedAt as Date | string | null) ?? null,
    expiresAt: (row.expiresAt as Date | string | null) ?? null,
    revokedAt: (row.revokedAt as Date | string | null) ?? null,
    createdAt: row.createdAt as Date | string,
    updatedAt: (row.updatedAt as Date | string | null) ?? null,
  }
}

function mapRawRows(result: { rows?: unknown } | unknown): Array<Record<string, unknown>> {
  const rows = ((result as { rows?: unknown }).rows ?? result) as Array<Record<string, unknown>>
  return Array.isArray(rows) ? rows : []
}

/**
 * Tenant-scoped api_keys. CRUD callers must run inside runWithTenant.
 * resolveByHash uses SECURITY DEFINER resolve_api_key and may run before tenant bind.
 */
export class ApiKeyRepository {
  async resolveByHash(keyHash: string, client: Db = db): Promise<ResolvedApiKey | null> {
    const result = await client.rawQuery('SELECT * FROM resolve_api_key(?)', [keyHash])
    const row = mapRawRows(result)[0]
    return row ? mapResolved(row) : null
  }

  async insert(params: InsertApiKeyParams, client: Db = db): Promise<ApiKeyRow> {
    const [row] = await client
      .table('api_keys')
      .insert({
        organizationId: params.organizationId,
        createdByUserId: params.createdByUserId ?? null,
        name: params.name,
        keyPrefix: params.keyPrefix,
        keyHash: params.keyHash,
        scopes: params.scopes,
        expiresAt: params.expiresAt ?? null,
      })
      .returning('*')

    return mapRow(row as Record<string, unknown>)
  }

  async listForOrg(organizationId: string, client: Db = db): Promise<ApiKeyRow[]> {
    const rows = await client
      .from('api_keys')
      .where('organizationId', organizationId)
      .orderBy('createdAt', 'desc')
    return rows.map((row) => mapRow(row as Record<string, unknown>))
  }

  async findByIdForOrg(
    params: { organizationId: string; id: string },
    client: Db = db
  ): Promise<ApiKeyRow | null> {
    const row = await client
      .from('api_keys')
      .where('id', params.id)
      .where('organizationId', params.organizationId)
      .first()
    return row ? mapRow(row as Record<string, unknown>) : null
  }

  async revokeForOrg(
    params: { organizationId: string; id: string; revokedAt?: Date },
    client: Db = db
  ): Promise<ApiKeyRow | null> {
    const [row] = await client
      .from('api_keys')
      .where('id', params.id)
      .where('organizationId', params.organizationId)
      .whereNull('revokedAt')
      .update({
        revokedAt: params.revokedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .returning('*')
    return row ? mapRow(row as Record<string, unknown>) : null
  }

  async touchLastUsed(id: string, client: Db = db): Promise<void> {
    await client.from('api_keys').where('id', id).update({ lastUsedAt: new Date() })
  }
}
