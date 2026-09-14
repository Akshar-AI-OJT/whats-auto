import vine from '@vinejs/vine'
import { INTEGRATION_EVENT_TYPES } from '#lib/integrations/event_contract'

export const genericIntegrationEventValidator = vine.create(
  vine.object({
    externalEventId: vine.string().trim().minLength(1).maxLength(255),
    type: vine.enum(INTEGRATION_EVENT_TYPES),
    occurredAt: vine.string().trim().minLength(1),
    payload: vine.record(vine.any()),
  })
)

export const shopenupIntegrationEventValidator = vine.create(
  vine.object({
    eventType: vine.string().trim().minLength(1).maxLength(128),
    timestamp: vine.string().trim().optional(),
    data: vine.record(vine.any()),
  })
)
