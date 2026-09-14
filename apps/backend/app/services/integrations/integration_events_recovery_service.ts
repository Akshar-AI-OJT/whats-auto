import logger from '@adonisjs/core/services/logger'
import IntegrationEventReceived from '#events/integration_event_received'
import type {
  IntegrationEventProvider,
  IntegrationEventReceivedPayload,
  IntegrationEventSubject,
  IntegrationEventType,
} from '#lib/integrations/event_contract'
import { INTEGRATION_EVENT_TYPES } from '#lib/integrations/event_contract'
import {
  IntegrationEventRepository,
  type IntegrationEventRow,
} from '#repositories/integration_event_repository'

const STALE_AFTER_MS = 60_000

export class IntegrationEventsRecoveryService {
  constructor(private events: IntegrationEventRepository = new IntegrationEventRepository()) {}

  async recoverStale(params?: { olderThan?: Date; limit?: number }): Promise<{
    woken: number
    scanned: number
  }> {
    const olderThan = params?.olderThan ?? new Date(Date.now() - STALE_AFTER_MS)
    const rows = await this.events.listStaleAccepted({
      olderThan,
      limit: params?.limit ?? 50,
    })

    let woken = 0
    for (const row of rows) {
      const payload = toReceivedPayload(row)
      if (!payload) {
        continue
      }
      try {
        await IntegrationEventReceived.dispatch(payload)
        woken++
      } catch (error) {
        logger.error(
          {
            integrationEventId: row.id,
            organizationId: row.organizationId,
            err: error instanceof Error ? error.message : 'unknown',
          },
          'integration.event.recovery_dispatch_failed'
        )
      }
    }

    return { woken, scanned: rows.length }
  }
}

function toReceivedPayload(row: IntegrationEventRow): IntegrationEventReceivedPayload | null {
  if (!INTEGRATION_EVENT_TYPES.includes(row.eventType as IntegrationEventType)) {
    return null
  }

  const stored = row.payload
  const subjectRaw = stored.subject
  const subject: IntegrationEventSubject =
    subjectRaw && typeof subjectRaw === 'object' && !Array.isArray(subjectRaw)
      ? (subjectRaw as IntegrationEventSubject)
      : {}
  const dataRaw = stored.data
  const data: Record<string, unknown> =
    dataRaw && typeof dataRaw === 'object' && !Array.isArray(dataRaw)
      ? (dataRaw as Record<string, unknown>)
      : stored
  const occurredAt =
    typeof stored.occurredAt === 'string' && stored.occurredAt.trim()
      ? stored.occurredAt
      : new Date(row.receivedAt).toISOString()
  const provider: IntegrationEventProvider = row.provider === 'custom' ? 'custom' : 'shopenup'

  return {
    integrationEventId: row.id,
    organizationId: row.organizationId,
    provider,
    ...(row.connectionId ? { connectionId: row.connectionId } : {}),
    externalEventId: row.externalEventId,
    type: row.eventType as IntegrationEventType,
    occurredAt,
    subject,
    payload: data,
  }
}
