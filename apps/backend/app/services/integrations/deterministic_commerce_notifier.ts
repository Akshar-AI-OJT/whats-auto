import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import ContactException from '#exceptions/contact_exception'
import type { IntegrationEventReceivedPayload } from '#lib/integrations/event_contract'
import {
  COMMERCE_TEMPLATE_BY_TYPE,
  INTEGRATION_NOTIFY_ERROR,
  collectNotifierValues,
  pickRequiredTemplateValues,
} from '#lib/integrations/notifier_mapping'
import { parseParameterSchema } from '#lib/meta_whatsapp/template_parameters'
import { IntegrationEventRepository } from '#repositories/integration_event_repository'
import { WhatsappWebhookRepository } from '#repositories/whatsapp_webhook_repository'
import { IntegrationRecipientService } from '#services/integrations/integration_recipient_service'
import { runWithTenant } from '#services/tenant_context'
import WhatsappOutboundService from '#services/whatsapp_outbound_service'

export class DeterministicCommerceNotifier {
  constructor(
    private events: IntegrationEventRepository = new IntegrationEventRepository(),
    private recipients: IntegrationRecipientService = new IntegrationRecipientService(),
    private outbound: WhatsappOutboundService = new WhatsappOutboundService(),
    private contacts: WhatsappWebhookRepository = new WhatsappWebhookRepository()
  ) {}

  async handle(event: IntegrationEventReceivedPayload): Promise<void> {
    try {
      await runWithTenant(event.organizationId, async () => {
        await this.#process(event)
      })
    } catch (error) {
      logger.error(
        {
          integrationEventId: event.integrationEventId,
          organizationId: event.organizationId,
          type: event.type,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'integration.event.notify_failed'
      )
    }
  }

  async #process(event: IntegrationEventReceivedPayload): Promise<void> {
    const row = await this.events.findById({
      organizationId: event.organizationId,
      id: event.integrationEventId,
    })
    if (!row || row.status !== 'accepted') {
      return
    }

    if (event.type === 'crm.contact_upserted') {
      await this.#upsertCrmContact(event)
      return
    }

    const templateName = COMMERCE_TEMPLATE_BY_TYPE[event.type]
    if (!templateName) {
      return
    }

    const phone = event.subject.phone?.trim()
    if (!phone) {
      await this.#fail(event, INTEGRATION_NOTIFY_ERROR.MISSING_PHONE)
      return
    }

    const template = await db
      .from('message_templates')
      .where('organizationId', event.organizationId)
      .where('name', templateName)
      .first()
    const schema = template
      ? parseParameterSchema(
          typeof template.parameterSchema === 'string'
            ? JSON.parse(template.parameterSchema)
            : template.parameterSchema
        )
      : null
    if (!template || String(template.status).toLowerCase() !== 'approved' || !schema?.sendable) {
      await this.#fail(event, INTEGRATION_NOTIFY_ERROR.TEMPLATE_NOT_READY)
      return
    }

    const collected = collectNotifierValues({
      subject: event.subject,
      payload: event.payload,
    })

    let recipient: { conversationId: string }
    try {
      recipient = await this.recipients.ensureConversationForPhone({
        organizationId: event.organizationId,
        phone,
        profileName: collected.parameters.customer_name ?? null,
      })
    } catch (error) {
      await this.#fail(
        event,
        this.#codeFrom(error) ?? INTEGRATION_NOTIFY_ERROR.CONFIG_NOT_CONNECTED
      )
      return
    }

    const existing = await db
      .from('messages')
      .where('organizationId', event.organizationId)
      .where('clientIdempotencyKey', event.integrationEventId)
      .select('id')
      .first()
    if (existing) {
      await this.events.markProcessed(event.integrationEventId)
      return
    }

    const required = [
      ...schema.headerNames,
      ...schema.bodyNames,
      ...(schema.urlButtons ?? []).map((button) => button.name),
    ]
    const picked = pickRequiredTemplateValues({
      required,
      candidates: collected.parameters,
    })
    if (!picked.ok) {
      await this.#fail(event, INTEGRATION_NOTIFY_ERROR.TEMPLATE_PARAMS)
      return
    }

    try {
      await this.outbound.queueTemplate({
        organizationId: event.organizationId,
        conversationId: recipient.conversationId,
        templateId: String(template.id),
        parameters: picked.values,
        headerMediaUrl: schema.headerMediaType ? collected.headerMediaUrl : undefined,
        idempotencyKey: event.integrationEventId,
        channel: 'system',
      })
    } catch (error) {
      await this.#fail(event, this.#codeFrom(error) ?? INTEGRATION_NOTIFY_ERROR.TEMPLATE_PARAMS)
      return
    }

    await this.events.markProcessed(event.integrationEventId)
  }

  async #upsertCrmContact(event: IntegrationEventReceivedPayload): Promise<void> {
    const phone = event.subject.phone?.trim()
    if (!phone) {
      await this.#fail(event, INTEGRATION_NOTIFY_ERROR.MISSING_PHONE)
      return
    }

    const collected = collectNotifierValues({
      subject: event.subject,
      payload: event.payload,
    })

    try {
      await db.transaction(async (trx) => {
        await this.contacts.upsertContactByWaId(trx, {
          organizationId: event.organizationId,
          waId: phone,
          profileName: collected.parameters.customer_name ?? null,
        })
      })
    } catch (error) {
      await this.#fail(event, this.#codeFrom(error) ?? INTEGRATION_NOTIFY_ERROR.INVALID_PHONE)
      return
    }

    await this.events.markProcessed(event.integrationEventId)
  }

  async #fail(event: IntegrationEventReceivedPayload, errorCode: string): Promise<void> {
    await this.events.markFailed({
      id: event.integrationEventId,
      errorCode,
    })
  }

  #codeFrom(error: unknown): string | null {
    const code = error instanceof Error ? (error as { code?: string }).code : undefined
    if (code === 'E_OUTBOUND_CONFIG_NOT_CONNECTED') {
      return INTEGRATION_NOTIFY_ERROR.CONFIG_NOT_CONNECTED
    }
    if (
      code === 'E_OUTBOUND_TEMPLATE_NOT_FOUND' ||
      code === 'E_OUTBOUND_TEMPLATE_NOT_APPROVED' ||
      code === 'E_OUTBOUND_TEMPLATE_NOT_SENDABLE'
    ) {
      return INTEGRATION_NOTIFY_ERROR.TEMPLATE_NOT_READY
    }
    if (code === 'E_OUTBOUND_TEMPLATE_PARAMS' || code === 'E_OUTBOUND_MEDIA_LINK_UNAVAILABLE') {
      return INTEGRATION_NOTIFY_ERROR.TEMPLATE_PARAMS
    }
    if (error instanceof ContactException || code === 'E_CONTACT_PHONE_INVALID') {
      return INTEGRATION_NOTIFY_ERROR.INVALID_PHONE
    }
    return null
  }
}
