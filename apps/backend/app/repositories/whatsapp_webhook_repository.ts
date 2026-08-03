import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { normalizeContactPhone } from '#services/contact_service'
import { shouldApplyProviderStatus } from '#lib/meta_whatsapp/message_status'
import type { MessageMetadata } from '#lib/meta_whatsapp/types'
import type { MetaWebhookStatusName } from '#lib/meta_whatsapp/types'

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

export type WebhookMessageRow = {
  id: string
  organizationId: string
  conversationId: string
  senderType: string
  contentType: string
  contentText: string | null
  providerMessageId: string | null
  status: string
  errorMessage: string | null
  metadata: MessageMetadata
  occurredAt: Date | string | null
  providerStatusAt: Date | string | null
  sentAt: Date | string | null
  deliveredAt: Date | string | null
  readAt: Date | string | null
  failedAt: Date | string | null
}

export type InsertInboundMessageResult =
  | { inserted: false }
  | {
      inserted: true
      message: WebhookMessageRow
      conversationId: string
    }

export type ApplyDeliveryReceiptResult =
  | { updated: false; reason: 'not_found' | 'stale' }
  | {
      updated: true
      message: WebhookMessageRow
      previousStatus: string
    }

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Persistence for WhatsApp webhook ingestion.
 * CRM/Inbox queries only — orchestration and events stay in the service layer.
 */
export class WhatsappWebhookRepository {
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
    const phoneNormalized = normalizeContactPhone(params.waId)
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
      [params.organizationId, params.waId, phoneNormalized, name as string]
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
      message: this.mapMessageRow(row),
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
    const existing = await trx
      .from('messages')
      .where('organizationId', params.organizationId)
      .where('providerMessageId', params.providerMessageId)
      .whereNot('senderType', 'contact')
      .select(
        'id',
        'organizationId',
        'conversationId',
        'senderType',
        'contentType',
        'contentText',
        'providerMessageId',
        'status',
        'errorMessage',
        'metadata',
        'occurredAt',
        'providerStatusAt',
        'sentAt',
        'deliveredAt',
        'readAt',
        'failedAt'
      )
      .first()

    if (!existing) {
      return { updated: false, reason: 'not_found' }
    }

    const current = this.mapMessageRow(existing)
    const apply = shouldApplyProviderStatus({
      currentStatus: current.status,
      incomingStatus: params.status,
      currentProviderStatusAt: toDate(current.providerStatusAt),
      incomingProviderStatusAt: params.providerStatusAt,
    })

    if (!apply) {
      return { updated: false, reason: 'stale' }
    }

    const patch: Record<string, unknown> = {
      status: params.status,
      providerStatusAt: params.providerStatusAt,
      updatedAt: new Date(),
    }

    if (params.status === 'sent') {
      patch.sentAt = params.providerStatusAt
    } else if (params.status === 'delivered') {
      patch.deliveredAt = params.providerStatusAt
      if (!current.sentAt) patch.sentAt = params.providerStatusAt
    } else if (params.status === 'read') {
      patch.readAt = params.providerStatusAt
      if (!current.deliveredAt) patch.deliveredAt = params.providerStatusAt
      if (!current.sentAt) patch.sentAt = params.providerStatusAt
    } else if (params.status === 'failed') {
      patch.failedAt = params.providerStatusAt
      patch.errorMessage = params.errorMessage
    }

    const [row] = await trx
      .from('messages')
      .where('id', current.id)
      .update(patch)
      .returning([
        'id',
        'organizationId',
        'conversationId',
        'senderType',
        'contentType',
        'contentText',
        'providerMessageId',
        'status',
        'errorMessage',
        'metadata',
        'occurredAt',
        'providerStatusAt',
        'sentAt',
        'deliveredAt',
        'readAt',
        'failedAt',
      ])

    return {
      updated: true,
      message: this.mapMessageRow(row),
      previousStatus: current.status,
    }
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

  private mapMessageRow(row: Record<string, unknown>): WebhookMessageRow {
    let metadata: MessageMetadata = {}
    const rawMetadata = row.metadata
    if (typeof rawMetadata === 'string') {
      try {
        metadata = JSON.parse(rawMetadata) as MessageMetadata
      } catch {
        metadata = {}
      }
    } else if (rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
      metadata = rawMetadata as MessageMetadata
    }

    return {
      id: row.id as string,
      organizationId: row.organizationId as string,
      conversationId: row.conversationId as string,
      senderType: row.senderType as string,
      contentType: row.contentType as string,
      contentText: (row.contentText as string | null) ?? null,
      providerMessageId: (row.providerMessageId as string | null) ?? null,
      status: row.status as string,
      errorMessage: (row.errorMessage as string | null) ?? null,
      metadata,
      occurredAt: (row.occurredAt as Date | string | null) ?? null,
      providerStatusAt: (row.providerStatusAt as Date | string | null) ?? null,
      sentAt: (row.sentAt as Date | string | null) ?? null,
      deliveredAt: (row.deliveredAt as Date | string | null) ?? null,
      readAt: (row.readAt as Date | string | null) ?? null,
      failedAt: (row.failedAt as Date | string | null) ?? null,
    }
  }
}
