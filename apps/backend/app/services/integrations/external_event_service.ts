import IntegrationEventReceived from '#events/integration_event_received'
import type {
  IntegrationEventProvider,
  IntegrationEventReceivedPayload,
  IntegrationEventSubject,
  IntegrationEventType,
} from '#lib/integrations/event_contract'
import { ApiKeyRepository } from '#repositories/api_key_repository'
import { IntegrationConnectionRepository } from '#repositories/integration_connection_repository'
import { IntegrationEventRepository } from '#repositories/integration_event_repository'
import { ShopenupEventMapperService } from '#services/integrations/shopenup_event_mapper_service'

const SECRET_KEY = /secret|token|password|credential|api[_-]?key/i

export class ExternalEventService {
  constructor(
    private events: IntegrationEventRepository = new IntegrationEventRepository(),
    private connections: IntegrationConnectionRepository = new IntegrationConnectionRepository(),
    private keys: ApiKeyRepository = new ApiKeyRepository(),
    private mapper: ShopenupEventMapperService = new ShopenupEventMapperService()
  ) {}

  async acceptGeneric(params: {
    organizationId: string
    apiKeyId: string
    externalEventId: string
    type: IntegrationEventType
    occurredAt: string
    payload: Record<string, unknown>
  }) {
    return this.accept({
      organizationId: params.organizationId,
      apiKeyId: params.apiKeyId,
      provider: 'custom',
      externalEventId: params.externalEventId,
      type: params.type,
      occurredAt: params.occurredAt,
      subject: extractSubject(params.payload),
      payload: params.payload,
    })
  }

  async acceptShopenup(params: {
    organizationId: string
    apiKeyId: string
    eventType: string
    timestamp?: string
    data: Record<string, unknown>
  }) {
    const mapped = this.mapper.map({
      eventType: params.eventType,
      timestamp: params.timestamp,
      data: params.data,
    })
    return this.accept({
      organizationId: params.organizationId,
      apiKeyId: params.apiKeyId,
      provider: 'shopenup',
      ...mapped,
    })
  }

  private async accept(params: {
    organizationId: string
    apiKeyId: string
    provider: IntegrationEventProvider
    externalEventId: string
    type: IntegrationEventType
    occurredAt: string
    subject: IntegrationEventSubject
    payload: Record<string, unknown>
  }) {
    const sanitized = stripSecrets(params.payload)
    const shopenupConnection =
      params.provider === 'shopenup'
        ? await this.connections.findByProviderForOrg({
            organizationId: params.organizationId,
            provider: 'shopenup',
          })
        : null
    const connectionId = shopenupConnection?.id ?? null

    const ledger = await this.events.insertOrGetExisting({
      organizationId: params.organizationId,
      connectionId,
      provider: params.provider,
      externalEventId: params.externalEventId,
      eventType: params.type,
      payload: {
        occurredAt: params.occurredAt,
        subject: params.subject,
        data: sanitized,
      },
    })

    await this.keys.touchLastUsed(params.apiKeyId)

    if (ledger.inserted) {
      const emitted: IntegrationEventReceivedPayload = {
        integrationEventId: ledger.row.id,
        organizationId: params.organizationId,
        provider: params.provider,
        ...(connectionId ? { connectionId } : {}),
        externalEventId: params.externalEventId,
        type: params.type,
        occurredAt: params.occurredAt,
        subject: params.subject,
        payload: sanitized,
      }
      await IntegrationEventReceived.dispatch(emitted)
    }

    return { status: 'accepted' as const, eventId: ledger.row.id, inserted: ledger.inserted }
  }
}

function stripSecrets(value: Record<string, unknown>): Record<string, unknown> {
  return stripUnknown(value) as Record<string, unknown>
}

function stripUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripUnknown(item))
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) continue
      output[key] = stripUnknown(nested)
    }
    return output
  }
  return value
}

function extractSubject(payload: Record<string, unknown>): IntegrationEventSubject {
  const subject: IntegrationEventSubject = {}
  const phone = asString(payload.phone)
  const email = asString(payload.email)
  const externalOrderId = asString(payload.externalOrderId ?? payload.orderId)
  const externalContactId = asString(payload.externalContactId ?? payload.contactId)
  if (phone) subject.phone = phone
  if (email) subject.email = email
  if (externalOrderId) subject.externalOrderId = externalOrderId
  if (externalContactId) subject.externalContactId = externalContactId
  return subject
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}
