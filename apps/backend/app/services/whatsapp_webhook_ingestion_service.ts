import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import logger from '@adonisjs/core/services/logger'
import InboxMessageReceived from '#events/inbox_message_received'
import InboxStatusUpdated from '#events/inbox_status_updated'
import {
  parseWebhookChange,
  type ParsedDeliveryReceipt,
  type ParsedInboundMessage,
} from '#lib/meta_whatsapp/webhook_parser'
import type { MetaWebhookPayload } from '#lib/meta_whatsapp/types'
import { MessageReceiptRepository } from '#repositories/message_receipt_repository'
import { normalizeContactPhone } from '#services/contact_service'
import { runWithTenant } from '#services/tenant_context'

type ConnectedWhatsappConfig = {
  id: string
  organizationId: string
  phoneNumberId: string
  status: string
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: string }).code
    if (code === '23505') return true
    current = (current as { cause?: unknown }).cause ?? (current as { original?: unknown }).original
  }
  return false
}

function previewText(contentText: string | null, contentType: string): string {
  const trimmed = contentText?.trim()
  if (trimmed) return trimmed.slice(0, 240)
  return `[${contentType}]`
}

/**
 * Persists Meta Cloud API webhook changes into inbox contacts/conversations/messages.
 */
export class WhatsappWebhookIngestionService {
  constructor(private receipts: MessageReceiptRepository = new MessageReceiptRepository()) {}

  async ingestPayload(payload: MetaWebhookPayload): Promise<void> {
    const entries = payload.entry ?? []
    for (const entry of entries) {
      const changes = entry.changes ?? []
      for (const change of changes) {
        await this.processChange({ field: change.field, value: change.value })
      }
    }
  }

  async processChange(params: { field: string | undefined; value: unknown }): Promise<void> {
    const parsed = parseWebhookChange(params)
    if (parsed.kind === 'skip') {
      logger.info(
        { reason: parsed.reason, field: parsed.field },
        'whatsapp.webhook.change_skipped'
      )
      return
    }

    const config = await this.resolveConnectedConfig(parsed.phoneNumberId)
    if (!config) {
      logger.warn(
        { phoneNumberId: parsed.phoneNumberId },
        'whatsapp.webhook.config_not_found'
      )
      return
    }

    await runWithTenant(config.organizationId, async () => {
      for (const message of parsed.messages) {
        try {
          await this.persistInboundMessage(config, message)
        } catch (error) {
          logger.error(
            {
              organizationId: config.organizationId,
              providerMessageId: message.providerMessageId,
              err: error instanceof Error ? error.message : 'unknown',
            },
            'whatsapp.webhook.inbound_persist_failed'
          )
        }
      }

      for (const status of parsed.statuses) {
        try {
          await this.persistDeliveryReceipt(config, status)
        } catch (error) {
          logger.error(
            {
              organizationId: config.organizationId,
              providerMessageId: status.providerMessageId,
              err: error instanceof Error ? error.message : 'unknown',
            },
            'whatsapp.webhook.receipt_persist_failed'
          )
        }
      }
    })
  }

  protected async resolveConnectedConfig(
    phoneNumberId: string
  ): Promise<ConnectedWhatsappConfig | null> {
    const result = await db.rawQuery(
      `SELECT id, "organizationId", "phoneNumberId", status
       FROM resolve_connected_whatsapp_config(?)`,
      [phoneNumberId]
    )
    const row = (result.rows?.[0] ?? result[0]) as Record<string, unknown> | undefined
    if (!row) return null

    return {
      id: row.id as string,
      organizationId: row.organizationId as string,
      phoneNumberId: row.phoneNumberId as string,
      status: row.status as string,
    }
  }

  protected async persistInboundMessage(
    config: ConnectedWhatsappConfig,
    inbound: ParsedInboundMessage
  ): Promise<void> {
    const events: Array<() => Promise<void>> = []

    await db.transaction(async (trx) => {
      const existing = await trx
        .from('messages')
        .where('organizationId', config.organizationId)
        .where('providerMessageId', inbound.providerMessageId)
        .select('id')
        .first()

      if (existing) {
        return
      }

      const contact = await this.findOrCreateContact(trx, {
        organizationId: config.organizationId,
        waId: inbound.fromWaId,
        profileName: inbound.profileName,
      })

      const conversation = await this.findOrOpenConversation(trx, {
        organizationId: config.organizationId,
        whatsappConfigId: config.id,
        contactId: contact.id,
      })

      const now = new Date()
      let messageId: string

      try {
        const [message] = await trx
          .table('messages')
          .insert({
            organizationId: config.organizationId,
            conversationId: conversation.id,
            senderType: 'contact',
            senderId: null,
            contentType: inbound.contentType,
            contentText: inbound.contentText,
            providerMessageId: inbound.providerMessageId,
            status: 'delivered',
            occurredAt: inbound.occurredAt,
            deliveredAt: inbound.occurredAt,
            providerStatusAt: inbound.occurredAt,
            metadata: inbound.metadata,
            createdAt: now,
            updatedAt: now,
          })
          .returning(['id'])

        messageId = message.id as string
      } catch (error) {
        if (isUniqueViolation(error)) {
          return
        }
        throw error
      }

      await trx
        .from('conversations')
        .where('id', conversation.id)
        .where('organizationId', config.organizationId)
        .update({
          lastMessageText: previewText(inbound.contentText, inbound.contentType),
          lastMessageAt: inbound.occurredAt,
          unreadCount: Number(conversation.unreadCount ?? 0) + 1,
          status: conversation.status === 'closed' ? 'open' : conversation.status,
          closedAt: conversation.status === 'closed' ? null : conversation.closedAt,
          updatedAt: now,
        })

      const occurredAtIso = inbound.occurredAt.toISOString()
      const createdAtIso = now.toISOString()
      events.push(() =>
        InboxMessageReceived.dispatch({
          organizationId: config.organizationId,
          conversationId: conversation.id,
          messageId,
          whatsappConfigId: config.id,
          contactId: contact.id,
          contentType: inbound.contentType,
          contentText: inbound.contentText,
          direction: 'inbound',
          providerMessageId: inbound.providerMessageId,
          status: 'delivered',
          occurredAt: occurredAtIso,
          createdAt: createdAtIso,
        })
      )
    })

    for (const emit of events) {
      try {
        await emit()
      } catch (error) {
        logger.error(
          {
            organizationId: config.organizationId,
            err: error instanceof Error ? error.message : 'unknown',
          },
          'whatsapp.webhook.inbox_message_received_event_failed'
        )
      }
    }
  }

  protected async persistDeliveryReceipt(
    config: ConnectedWhatsappConfig,
    receipt: ParsedDeliveryReceipt
  ): Promise<void> {
    const events: Array<() => Promise<void>> = []

    await db.transaction(async (trx) => {
      const applied = await this.receipts.applyDeliveryReceipt(trx, {
        organizationId: config.organizationId,
        providerMessageId: receipt.providerMessageId,
        status: receipt.status,
        providerStatusAt: receipt.providerStatusAt,
        errorMessage: receipt.errorMessage,
      })

      if (!applied.found) {
        await this.receipts.upsertUnmatchedProviderReceipt(trx, {
          organizationId: config.organizationId,
          whatsappConfigId: config.id,
          providerMessageId: receipt.providerMessageId,
          status: receipt.status,
          providerStatusAt: receipt.providerStatusAt,
          errorMessage: receipt.errorMessage,
          metadata: receipt.metadataErrors.length > 0 ? { errors: receipt.metadataErrors } : {},
        })
        return
      }

      if (!applied.updated) {
        return
      }

      events.push(() =>
        InboxStatusUpdated.dispatch({
          organizationId: config.organizationId,
          conversationId: applied.message.conversationId,
          messageId: applied.message.id,
          providerMessageId: receipt.providerMessageId,
          previousStatus: applied.previousStatus,
          status: applied.message.status,
          providerStatusAt: new Date(
            applied.message.providerStatusAt as string | Date
          ).toISOString(),
        })
      )
    })

    for (const emit of events) {
      try {
        await emit()
      } catch (error) {
        logger.error(
          {
            organizationId: config.organizationId,
            err: error instanceof Error ? error.message : 'unknown',
          },
          'whatsapp.webhook.inbox_status_updated_event_failed'
        )
      }
    }
  }

  protected async findOrCreateContact(
    trx: TransactionClientContract,
    params: { organizationId: string; waId: string; profileName: string | null }
  ): Promise<{ id: string }> {
    const phoneNormalized = normalizeContactPhone(params.waId)

    const existing = await trx
      .from('contacts')
      .where('organizationId', params.organizationId)
      .where('phoneNormalized', phoneNormalized)
      .whereNull('deletedAt')
      .select('id', 'name')
      .first()

    if (existing) {
      if (!existing.name && params.profileName) {
        await trx
          .from('contacts')
          .where('id', existing.id)
          .update({ name: params.profileName, updatedAt: new Date() })
      }
      return { id: existing.id as string }
    }

    try {
      const [created] = await trx
        .table('contacts')
        .insert({
          organizationId: params.organizationId,
          phone: params.waId,
          phoneNormalized,
          name: params.profileName,
          customFields: {},
          createdByUserId: null,
        })
        .returning(['id'])

      return { id: created.id as string }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error

      const raced = await trx
        .from('contacts')
        .where('organizationId', params.organizationId)
        .where('phoneNormalized', phoneNormalized)
        .whereNull('deletedAt')
        .select('id')
        .first()

      if (!raced) throw error
      return { id: raced.id as string }
    }
  }

  protected async findOrOpenConversation(
    trx: TransactionClientContract,
    params: { organizationId: string; whatsappConfigId: string; contactId: string }
  ): Promise<{ id: string; status: string; unreadCount: number; closedAt: Date | string | null }> {
    const existing = await trx
      .from('conversations')
      .where('organizationId', params.organizationId)
      .where('whatsappConfigId', params.whatsappConfigId)
      .where('contactId', params.contactId)
      .forUpdate()
      .first()

    if (existing) {
      return {
        id: existing.id as string,
        status: existing.status as string,
        unreadCount: Number(existing.unreadCount ?? 0),
        closedAt: (existing.closedAt as Date | string | null) ?? null,
      }
    }

    try {
      const [created] = await trx
        .table('conversations')
        .insert({
          organizationId: params.organizationId,
          whatsappConfigId: params.whatsappConfigId,
          contactId: params.contactId,
          status: 'open',
          unreadCount: 0,
        })
        .returning(['id', 'status', 'unreadCount', 'closedAt'])

      return {
        id: created.id as string,
        status: created.status as string,
        unreadCount: Number(created.unreadCount ?? 0),
        closedAt: (created.closedAt as Date | string | null) ?? null,
      }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error

      const raced = await trx
        .from('conversations')
        .where('organizationId', params.organizationId)
        .where('whatsappConfigId', params.whatsappConfigId)
        .where('contactId', params.contactId)
        .forUpdate()
        .first()

      if (!raced) throw error

      return {
        id: raced.id as string,
        status: raced.status as string,
        unreadCount: Number(raced.unreadCount ?? 0),
        closedAt: (raced.closedAt as Date | string | null) ?? null,
      }
    }
  }
}
