import IntegrationException from '#exceptions/integration_exception'
import type {
  IntegrationEventSubject,
  MappedIntegrationEvent,
} from '#lib/integrations/event_contract'

const COD_STATUSES = new Set(['awaiting', 'not_paid', 'cod'])
const PREPAID_STATUSES = new Set(['captured', 'paid', 'authorized', 'prepaid'])

/**
 * Maps Medusa-native Shopenup bodies to the frozen Integration event contract.
 * Does not send WhatsApp.
 */
export class ShopenupEventMapperService {
  map(input: {
    eventType: string
    timestamp?: string
    data: Record<string, unknown>
  }): MappedIntegrationEvent {
    const occurredAt = input.timestamp?.trim() || new Date().toISOString()
    const data = input.data
    const subject = extractSubject(data)

    switch (input.eventType) {
      case 'order.placed': {
        const cod = classifyCod(data)
        if (cod === null) {
          throw IntegrationException.unmappedEvent()
        }
        return {
          externalEventId: requireEventId(data.orderId ?? data.id),
          type: cod ? 'commerce.order_placed' : 'commerce.order_paid',
          occurredAt,
          subject,
          payload: data,
        }
      }
      case 'order.fulfillment_created':
        return {
          externalEventId: requireEventId(data.orderId ?? data.id),
          type: 'commerce.order_shipped',
          occurredAt,
          subject,
          payload: data,
        }
      case 'order.delivered':
        return {
          externalEventId: requireEventId(data.orderId ?? data.id),
          type: 'commerce.order_delivered',
          occurredAt,
          subject,
          payload: data,
        }
      case 'product.created':
        return {
          externalEventId: requireEventId(data.id ?? data.productHandle),
          type: 'commerce.product_created',
          occurredAt,
          subject,
          payload: data,
        }
      default:
        throw IntegrationException.unmappedEvent()
    }
  }
}

function requireEventId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw IntegrationException.missingEventId()
  }
  return value.trim()
}

function classifyCod(data: Record<string, unknown>): boolean | null {
  if (data.isCod === true) return true
  if (data.isCod === false) return false

  const status = String(data.payment_status ?? data.paymentStatus ?? '')
    .trim()
    .toLowerCase()
  if (COD_STATUSES.has(status)) return true
  if (PREPAID_STATUSES.has(status)) return false
  return null
}

function extractSubject(data: Record<string, unknown>): IntegrationEventSubject {
  const subject: IntegrationEventSubject = {}
  const phone = asString(data.customerPhone ?? data.phone)
  const email = asString(data.customerEmail ?? data.email)
  const externalOrderId = asString(data.orderId ?? data.displayId)
  const externalContactId = asString(data.customerId ?? data.externalContactId)
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
