import type { IntegrationConnectionRow } from '#repositories/integration_connection_repository'

export type IntegrationConnectionResponse = {
  id: string
  organizationId: string
  provider: string
  externalAccountId: string | null
  displayName: string
  config: Record<string, unknown>
  status: string
  lastSyncAt: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  createdAt: string
  updatedAt: string | null
}

export function transformIntegrationConnection(
  row: IntegrationConnectionRow
): IntegrationConnectionResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    provider: row.provider,
    externalAccountId: row.externalAccountId,
    displayName: row.displayName,
    config: row.config,
    status: row.status,
    lastSyncAt: row.lastSyncAt ? toIso(row.lastSyncAt) : null,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    createdAt: toIso(row.createdAt),
    updatedAt: row.updatedAt ? toIso(row.updatedAt) : null,
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
