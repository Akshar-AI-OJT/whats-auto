import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export type IntegrationEventProvider = 'shopenup' | 'custom'
export type IntegrationEventStatus = 'accepted' | 'processed' | 'failed'

export type IntegrationEventRow = {
  id: string
  organizationId: string
  connectionId: string | null
  provider: string
  externalEventId: string
  eventType: string
  payload: Record<string, unknown>
  status: string
  errorCode: string | null
  receivedAt: Date | string
  processedAt: Date | string | null
}

export type InsertIntegrationEventParams = {
  organizationId: string
  connectionId?: string | null
  provider: IntegrationEventProvider
  externalEventId: string
  eventType: string
  payload: Record<string, unknown>
}

type Db = typeof db | TransactionClientContract

function mapPayload(value: unknown): Record<string, unknown> {
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

function mapRow(row: Record<string, unknown>): IntegrationEventRow {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    connectionId: (row.connectionId as string | null) ?? null,
    provider: String(row.provider),
    externalEventId: String(row.externalEventId),
    eventType: String(row.eventType),
    payload: mapPayload(row.payload),
    status: String(row.status),
    errorCode: (row.errorCode as string | null) ?? null,
    receivedAt: row.receivedAt as Date | string,
    processedAt: (row.processedAt as Date | string | null) ?? null,
  }
}

/**
 * Tenant-scoped integration_events ledger. Callers must run inside runWithTenant.
 */
export class IntegrationEventRepository {
  async findByExternalId(
    params: {
      organizationId: string
      provider: IntegrationEventProvider
      externalEventId: string
    },
    client: Db = db
  ): Promise<IntegrationEventRow | null> {
    const row = await client
      .from('integration_events')
      .where('organizationId', params.organizationId)
      .where('provider', params.provider)
      .where('externalEventId', params.externalEventId)
      .first()
    return row ? mapRow(row as Record<string, unknown>) : null
  }

  async findById(params: {
    organizationId: string
    id: string
  }): Promise<IntegrationEventRow | null> {
    const row = await db
      .from('integration_events')
      .where('organizationId', params.organizationId)
      .where('id', params.id)
      .first()
    return row ? mapRow(row as Record<string, unknown>) : null
  }

  async insertOrGetExisting(
    params: InsertIntegrationEventParams,
    client: Db = db
  ): Promise<{ row: IntegrationEventRow; inserted: boolean }> {
    try {
      const [created] = await client
        .table('integration_events')
        .insert({
          organizationId: params.organizationId,
          connectionId: params.connectionId ?? null,
          provider: params.provider,
          externalEventId: params.externalEventId,
          eventType: params.eventType,
          payload: params.payload,
          status: 'accepted',
        })
        .returning('*')
      return { row: mapRow(created as Record<string, unknown>), inserted: true }
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === '23505') {
        const existing = await this.findByExternalId(
          {
            organizationId: params.organizationId,
            provider: params.provider,
            externalEventId: params.externalEventId,
          },
          client
        )
        if (existing) {
          return { row: existing, inserted: false }
        }
      }
      throw error
    }
  }

  async markProcessed(id: string, client: Db = db): Promise<void> {
    await client.from('integration_events').where('id', id).where('status', 'accepted').update({
      status: 'processed',
      errorCode: null,
      processedAt: new Date(),
    })
  }

  async markFailed(params: { id: string; errorCode: string }, client: Db = db): Promise<void> {
    await client
      .from('integration_events')
      .where('id', params.id)
      .where('status', 'accepted')
      .update({
        status: 'failed',
        errorCode: params.errorCode,
        processedAt: new Date(),
      })
  }

  async listStaleAccepted(params: {
    olderThan: Date
    limit?: number
  }): Promise<IntegrationEventRow[]> {
    const result = await db.rawQuery('SELECT * FROM list_stale_accepted_integration_events(?, ?)', [
      params.olderThan,
      params.limit ?? 50,
    ])
    const rows = ((result as { rows?: unknown }).rows ?? result) as Array<Record<string, unknown>>
    if (!Array.isArray(rows)) return []
    return rows.map((row) => mapRow(row))
  }
}
