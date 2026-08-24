import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { normalizeWhatsappWaId } from '#lib/contact_phone'
import type { MessageMetadata } from '#lib/meta_whatsapp/types'
import type { MetaWebhookStatusName } from '#lib/meta_whatsapp/types'
import {
  mapReceiptMessageRow,
  MessageReceiptRepository,
  type ApplyDeliveryReceiptResult,
  type ReceiptMessageRow,
} from '#repositories/message_receipt_repository'

export type ResolvedWhatsappConfig = {
  id: string
  organizationId: string
}

export type WebhookContactRow = {
  id: string
  organizationId: string
  phone: string
  phoneNormalized: string
  name: string | null
}

export type WebhookConversationRow = {
  id: string
  organizationId: string
  whatsappConfigId: string
  contactId: string
  status: string
  unreadCount: number
  lastMessageAt: Date | string | null
  closedAt: Date | string | null
}

export type WebhookMessageRow = ReceiptMessageRow

export type InsertInboundMessageResult =
  | { inserted: false }
  | {
      inserted: true
      message: WebhookMessageRow
      conversationId: string
    }

export type { ApplyDeliveryReceiptResult }

/**
 * Persistence for WhatsApp webhook ingestion.
 * CRM/Inbox queries only — orchestration and events stay in the service layer.
 * Delivery receipts delegate to MessageReceiptRepository.
 */
export class WhatsappWebhookRepository {
  constructor(private receipts: MessageReceiptRepository = new MessageReceiptRepository()) {}

  /**
   * Resolve a connected config for a Meta phone_number_id using the
   * transaction-local webhook RLS GUC (set after HMAC verification).
   */
  async resolveConnectedConfig(phoneNumberId: string): Promise<ResolvedWhatsappConfig | null> {
    return db.transaction(async (trx) => {
      await trx.rawQuery(`SELECT set_config('app.webhook_phone_number_id', ?, true)`, [
        phoneNumberId,
      ])

      const row = await trx
        .from('whatsapp_configs as wc')
        .join('organizations as org', 'org.id', 'wc.organizationId')
        .where('wc.phoneNumberId', phoneNumberId)
        .where('wc.status', 'connected')
        .where('org.status', true)
        .whereNull('org.deletedAt')
        .select('wc.id', 'wc.organizationId')
        .first()

      if (!row) {
        return null
      }

      return {
        id: row.id as string,
        organizationId: row.organizationId as string,
      }
    })
  }

  /**
   * Upsert contact by org + normalized WhatsApp id.
   * Profile name is set only on insert so CRM-managed names are preserved.
   * Atomic ON CONFLICT — try/catch unique-violation would abort the open transaction.
   */
  async upsertContactByWaId(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      waId: string
      profileName: string | null
    }
  ): Promise<WebhookContactRow> {
    const phoneNormalized = normalizeWhatsappWaId(params.waId)
    const name = params.profileName?.trim() || null

    const result = await trx.rawQuery(
      `INSERT INTO "contacts" (
         "organizationId",
         "phone",
         "phoneNormalized",
         "name",
         "email",
         "company",
         "customFields",
         "createdByUserId"
       )
       VALUES (?, ?, ?, ?, NULL, NULL, '{}'::jsonb, NULL)
       ON CONFLICT ("organizationId", "phoneNormalized") WHERE "deletedAt" IS NULL
       DO UPDATE SET "id" = "contacts"."id"
       RETURNING
         "id",
         "organizationId",
         "phone",
         "phoneNormalized",
         "name"`,
      [params.organizationId, phoneNormalized, phoneNormalized, name as string]
    )

    const row = (result.rows?.[0] ?? result[0]) as WebhookContactRow | undefined
    if (!row) {
      throw new Error('upsertContactByWaId returned no row')
    }
    return row
  }

  /**
   * Atomic find-or-create for the unique conversation per org + WA config + contact.
   */
  async findOrCreateConversation(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      whatsappConfigId: string
      contactId: string
    }
  ): Promise<WebhookConversationRow> {
    const result = await trx.rawQuery(
      `INSERT INTO "conversations" (
         "organizationId",
         "whatsappConfigId",
         "contactId",
         "status",
         "unreadCount"
       )
       VALUES (?, ?, ?, 'open', 0)
       ON CONFLICT ("organizationId", "whatsappConfigId", "contactId")
       DO UPDATE SET "id" = "conversations"."id"
       RETURNING
         "id",
         "organizationId",
         "whatsappConfigId",
         "contactId",
         "status",
         "unreadCount",
         "lastMessageAt",
         "closedAt"`,
      [params.organizationId, params.whatsappConfigId, params.contactId]
    )

    const row = (result.rows?.[0] ?? result[0]) as WebhookConversationRow | undefined
    if (!row) {
      throw new Error('findOrCreateConversation returned no row')
    }
    return row
  }

  /**
   * Connected WhatsApp config for the tenant, if any.
   */
  async findConnectedConfigId(
    trx: TransactionClientContract,
    organizationId: string
  ): Promise<string | null> {
    const row = await trx
      .from('whatsapp_configs')
      .where('organizationId', organizationId)
      .where('status', 'connected')
      .select('id')
      .first()

    return row ? (row.id as string) : null
  }

  /**
   * Insert inbound message idempotently by providerMessageId (wamid).
   * Conversation counters/reopen only run when the insert succeeds.
   * Meta extras go only into metadata — interactivePayload stays null.
   */
  async insertInboundMessage(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      conversationId: string
      contentType: string
      contentText: string | null
      providerMessageId: string
      occurredAt: Date
      metadata: MessageMetadata
    }
  ): Promise<InsertInboundMessageResult> {
    const result = await trx.rawQuery(
      `INSERT INTO "messages" (
         "organizationId",
         "conversationId",
         "senderType",
         "senderId",
         "contentType",
         "contentText",
         "mediaUrl",
         "mediaAssetId",
         "messageTemplateId",
         "providerMessageId",
         "status",
         "replyToMessageId",
         "interactiveReplyId",
         "interactivePayload",
         "errorMessage",
         "occurredAt",
         "providerStatusAt",
         "deliveredAt",
         "metadata"
       )
       VALUES (
         ?, ?, 'contact', NULL, ?, ?, NULL, NULL, NULL, ?, 'delivered',
         NULL, NULL, NULL, NULL, ?, ?, ?, ?::jsonb
       )
       ON CONFLICT ("organizationId", "providerMessageId") WHERE "providerMessageId" IS NOT NULL
       DO NOTHING
       RETURNING
         "id",
         "organizationId",
         "conversationId",
         "senderType",
         "contentType",
         "contentText",
         "providerMessageId",
         "status",
         "errorMessage",
         "metadata",
         "occurredAt",
         "providerStatusAt",
         "sentAt",
         "deliveredAt",
         "readAt",
         "failedAt"`,
      [
        params.organizationId,
        params.conversationId,
        params.contentType,
        // Lucid StrictValues excludes null; pg still binds SQL NULL correctly.
        params.contentText as string,
        params.providerMessageId,
        params.occurredAt,
        params.occurredAt,
        params.occurredAt,
        JSON.stringify(params.metadata ?? {}),
      ]
    )

    const row = (result.rows?.[0] ?? result[0]) as Record<string, unknown> | undefined
    if (!row) {
      return { inserted: false }
    }

    await this.touchConversationAfterInbound(trx, {
      conversationId: params.conversationId,
      contentText: params.contentText,
      occurredAt: params.occurredAt,
    })

    return {
      inserted: true,
      message: mapReceiptMessageRow(row),
      conversationId: params.conversationId,
    }
  }

  async applyDeliveryReceipt(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      providerMessageId: string
      status: MetaWebhookStatusName
      providerStatusAt: Date
      errorMessage: string | null
    }
  ): Promise<ApplyDeliveryReceiptResult> {
    return this.receipts.applyDeliveryReceipt(trx, params)
  }

  async upsertUnmatchedProviderReceipt(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      whatsappConfigId: string
      providerMessageId: string
      status: MetaWebhookStatusName
      providerStatusAt: Date
      errorMessage: string | null
      metadata?: Record<string, unknown>
    }
  ) {
    return this.receipts.upsertUnmatchedProviderReceipt(trx, params)
  }

  private async touchConversationAfterInbound(
    trx: TransactionClientContract,
    params: {
      conversationId: string
      contentText: string | null
      occurredAt: Date
    }
  ): Promise<void> {
    await trx.rawQuery(
      `UPDATE "conversations"
       SET
         "unreadCount" = "unreadCount" + 1,
         "status" = 'open',
         "closedAt" = NULL,
         "lastMessageText" = CASE
           WHEN "lastMessageAt" IS NULL OR ? >= "lastMessageAt" THEN ?
           ELSE "lastMessageText"
         END,
         "lastMessageAt" = CASE
           WHEN "lastMessageAt" IS NULL OR ? >= "lastMessageAt" THEN ?
           ELSE "lastMessageAt"
         END,
         "updatedAt" = NOW()
       WHERE "id" = ?`,
      [
        params.occurredAt,
        // Lucid StrictValues excludes null; pg still binds SQL NULL correctly.
        params.contentText as string,
        params.occurredAt,
        params.occurredAt,
        params.conversationId,
      ]
    )
  }
}
