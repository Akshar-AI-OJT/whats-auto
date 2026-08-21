import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import InboxMessageReceived from '#events/inbox_message_received'
import InboxStatusUpdated from '#events/inbox_status_updated'
import ContactException from '#exceptions/contact_exception'
import { parseWebhookChange } from '#lib/meta_whatsapp/webhook_parser'
import { WhatsappWebhookRepository } from '#repositories/whatsapp_webhook_repository'
import { MemoryWorkingSetService } from '#services/ai/contracts/memory_working_set_service'
import RedisMemoryWorkingSetService from '#services/ai/redis_memory_working_set_service'
import CampaignAttributionService from '#services/campaign_attribution_service'
import { runWithTenant } from '#services/tenant_context'

type PendingEvent = InboxMessageReceived | InboxStatusUpdated

/**
 * Coordinates Meta webhook change values: parse → resolve tenant → persist → post-commit events.
 */
@inject()
export default class WhatsappWebhookIngestionService {
  constructor(
    private repository: WhatsappWebhookRepository,
    private attribution: CampaignAttributionService,
    private memory: MemoryWorkingSetService = new RedisMemoryWorkingSetService()
  ) {}

  async processChangeValue(params: { field: string | undefined; value: unknown }): Promise<void> {
    const parsed = parseWebhookChange(params)

    if (parsed.kind === 'skip') {
      logger.info(
        {
          outcome: parsed.reason,
          field: parsed.field,
        },
        'whatsapp.webhook.skipped'
      )
      return
    }

    if (parsed.messages.length === 0 && parsed.statuses.length === 0) {
      logger.info(
        {
          outcome: 'empty_inbox_payload',
          phoneNumberId: parsed.phoneNumberId,
          field: params.field ?? null,
        },
        'whatsapp.webhook.skipped'
      )
      return
    }

    const config = await this.repository.resolveConnectedConfig(parsed.phoneNumberId)
    if (!config) {
      logger.warn(
        {
          outcome: 'config_not_found',
          phoneNumberId: parsed.phoneNumberId,
        },
        'whatsapp.webhook.skipped'
      )
      return
    }

    const pendingEvents: PendingEvent[] = []

    await runWithTenant(config.organizationId, async () => {
      await db.transaction(async (trx) => {
        for (const inbound of parsed.messages) {
          let contact
          try {
            contact = await this.repository.upsertContactByWaId(trx, {
              organizationId: config.organizationId,
              waId: inbound.fromWaId,
              profileName: inbound.profileName,
            })
          } catch (error) {
            if (error instanceof ContactException && error.code === 'E_CONTACT_PHONE_INVALID') {
              logger.warn(
                {
                  outcome: 'invalid_contact_phone',
                  waId: inbound.fromWaId,
                  organizationId: config.organizationId,
                },
                'whatsapp.webhook.skipped'
              )
              continue
            }
            throw error
          }

          const conversation = await this.repository.findOrCreateConversation(trx, {
            organizationId: config.organizationId,
            whatsappConfigId: config.id,
            contactId: contact.id,
          })

          const result = await this.repository.insertInboundMessage(trx, {
            organizationId: config.organizationId,
            conversationId: conversation.id,
            contentType: inbound.contentType,
            contentText: inbound.contentText,
            providerMessageId: inbound.providerMessageId,
            occurredAt: inbound.occurredAt,
            metadata: inbound.metadata,
          })

          if (!result.inserted) {
            logger.info(
              {
                outcome: 'duplicate_wamid',
                providerMessageId: inbound.providerMessageId,
                organizationId: config.organizationId,
              },
              'whatsapp.webhook.duplicate'
            )
            continue
          }

          const attribution = await this.attribution.attributeInbound(trx, {
            organizationId: config.organizationId,
            conversationId: result.conversationId,
            contactId: contact.id,
            occurredAt: inbound.occurredAt,
            contextProviderMessageId: inbound.contextProviderMessageId,
          })
          if (attribution.campaignId) {
            logger.info(
              {
                outcome: 'campaign_attributed',
                source: attribution.source,
                campaignId: attribution.campaignId,
                countedReply: attribution.countedReply,
                organizationId: config.organizationId,
              },
              'whatsapp.webhook.attribution'
            )
          }

          pendingEvents.push(
            new InboxMessageReceived({
              organizationId: config.organizationId,
              conversationId: result.conversationId,
              messageId: result.message.id,
              whatsappConfigId: config.id,
              contactId: contact.id,
              contentType: result.message.contentType,
              contentText: result.message.contentText,
              direction: 'inbound',
              providerMessageId: inbound.providerMessageId,
              status: result.message.status,
              occurredAt: inbound.occurredAt.toISOString(),
              createdAt: inbound.occurredAt.toISOString(),
            })
          )
        }

        for (const receipt of parsed.statuses) {
          const result = await this.repository.applyDeliveryReceipt(trx, {
            organizationId: config.organizationId,
            providerMessageId: receipt.providerMessageId,
            status: receipt.status,
            providerStatusAt: receipt.providerStatusAt,
            errorMessage: receipt.errorMessage,
          })

          if (!result.updated) {
            if (result.reason === 'not_found') {
              const unmatched = await this.repository.upsertUnmatchedProviderReceipt(trx, {
                organizationId: config.organizationId,
                whatsappConfigId: config.id,
                providerMessageId: receipt.providerMessageId,
                status: receipt.status,
                providerStatusAt: receipt.providerStatusAt,
                errorMessage: receipt.errorMessage,
              })

              logger.info(
                {
                  outcome: unmatched.upserted
                    ? unmatched.reason === 'inserted'
                      ? 'receipt_unmatched_buffered'
                      : 'receipt_unmatched_updated'
                    : 'receipt_unmatched_stale',
                  providerMessageId: receipt.providerMessageId,
                  organizationId: config.organizationId,
                  status: receipt.status,
                },
                'whatsapp.webhook.receipt'
              )
            } else {
              logger.info(
                {
                  outcome: 'receipt_ignored_stale',
                  providerMessageId: receipt.providerMessageId,
                  organizationId: config.organizationId,
                  status: receipt.status,
                },
                'whatsapp.webhook.receipt'
              )
            }
            continue
          }

          logger.info(
            {
              outcome: 'receipt_updated',
              providerMessageId: receipt.providerMessageId,
              organizationId: config.organizationId,
              status: receipt.status,
              previousStatus: result.previousStatus,
            },
            'whatsapp.webhook.receipt'
          )

          pendingEvents.push(
            new InboxStatusUpdated({
              organizationId: config.organizationId,
              conversationId: result.message.conversationId,
              messageId: result.message.id,
              providerMessageId: receipt.providerMessageId,
              previousStatus: result.previousStatus,
              status: result.message.status,
              providerStatusAt: receipt.providerStatusAt.toISOString(),
            })
          )
        }
      })
    })

    for (const event of pendingEvents) {
      if (event instanceof InboxMessageReceived) {
        await this.#appendUserTurn(event)
        await InboxMessageReceived.dispatch(event.payload)
      } else {
        await InboxStatusUpdated.dispatch(event.payload)
      }
    }
  }

  async #appendUserTurn(event: InboxMessageReceived): Promise<void> {
    const content = event.payload.contentText?.trim()
    if (!content) return
    try {
      await this.memory.appendTurn(event.payload.organizationId, event.payload.conversationId, {
        role: 'user',
        content,
        timestamp: event.payload.occurredAt,
        messageId: event.payload.messageId,
      })
    } catch (error) {
      logger.warn(
        {
          organizationId: event.payload.organizationId,
          conversationId: event.payload.conversationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'whatsapp.webhook.memory_append_failed'
      )
    }
  }
}
