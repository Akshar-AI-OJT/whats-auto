export const INTEGRATION_EVENT_TYPES = [
  'crm.contact_upserted',
  'commerce.order_placed',
  'commerce.order_paid',
  'commerce.order_shipped',
  'commerce.order_delivered',
  'commerce.product_created',
] as const

export type IntegrationEventType = (typeof INTEGRATION_EVENT_TYPES)[number]
export type IntegrationEventProvider = 'shopenup' | 'custom'

export type IntegrationEventSubject = {
  externalContactId?: string
  contactId?: string
  externalOrderId?: string
  phone?: string
  email?: string
}

export type IntegrationEventReceivedPayload = {
  integrationEventId: string
  organizationId: string
  provider: IntegrationEventProvider
  connectionId?: string
  externalEventId: string
  type: IntegrationEventType
  occurredAt: string
  subject: IntegrationEventSubject
  payload: Record<string, unknown>
}

export type MappedIntegrationEvent = {
  externalEventId: string
  type: IntegrationEventType
  occurredAt: string
  subject: IntegrationEventSubject
  payload: Record<string, unknown>
}
