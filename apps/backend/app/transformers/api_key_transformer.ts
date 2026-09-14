import type { ApiKeyRow } from '#repositories/api_key_repository'

export type ApiKeyResponse = {
  id: string
  organizationId: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  secretToken?: string
}

export function transformApiKey(
  row: ApiKeyRow,
  options?: { secretToken?: string }
): ApiKeyResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes,
    lastUsedAt: row.lastUsedAt ? toIso(row.lastUsedAt) : null,
    expiresAt: row.expiresAt ? toIso(row.expiresAt) : null,
    revokedAt: row.revokedAt ? toIso(row.revokedAt) : null,
    createdAt: toIso(row.createdAt),
    ...(options?.secretToken ? { secretToken: options.secretToken } : {}),
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
