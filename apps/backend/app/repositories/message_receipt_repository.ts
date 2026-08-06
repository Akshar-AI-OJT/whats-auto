import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { MetaWebhookStatusName } from '#lib/meta_whatsapp/types'
import { shouldApplyProviderStatus } from '#lib/meta_whatsapp/message_status'

export type UnmatchedProviderReceiptRow = {
  id: string
  organizationId: string
  whatsappConfigId: string
  providerMessageId: string
  status: string
  providerStatusAt: Date | string
  errorMessage: string | null
  metadata: Record<string, unknown>
}

export type ApplyDeliveryReceiptResult = {
  found: boolean
  updated: boolean
  previousStatus: string
  message: {
    id: string
    conversationId: string
    status: string
    providerStatusAt: Date | string | null
  }
}

/**
 * Applies Meta delivery receipts to messages and buffers early unmatched receipts.
 */
export class MessageReceiptRepository {
  async lockUnmatchedProviderReceipt(
    trx: TransactionClientContract,
    params: { organizationId: string; providerMessageId: string }
  ): Promise<UnmatchedProviderReceiptRow | null> {
    const result = await trx.rawQuery(
      `SELECT *
       FROM "unmatched_provider_receipts"
       WHERE "organizationId" = ?
         AND "providerMessageId" = ?
       FOR UPDATE`,
      [params.organizationId, params.providerMessageId]
    )

    const row = (result.rows?.[0] ?? result[0]) as Record<string, unknown> | undefined
    if (!row) return null

    return {
      id: row.id as string,
      organizationId: row.organizationId as string,
      whatsappConfigId: row.whatsappConfigId as string,
      providerMessageId: row.providerMessageId as string,
      status: row.status as string,
      providerStatusAt: row.providerStatusAt as Date | string,
      errorMessage: (row.errorMessage as string | null) ?? null,
      metadata:
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : {},
    }
  }

  async deleteUnmatchedProviderReceipt(
    trx: TransactionClientContract,
    params: { organizationId: string; providerMessageId: string }
  ): Promise<void> {
    await trx
      .from('unmatched_provider_receipts')
      .where('organizationId', params.organizationId)
      .where('providerMessageId', params.providerMessageId)
      .delete()
  }

  /**
   * Upsert early status for a wamid that has not been persisted on messages yet.
   * Newer provider timestamps win; otherwise keep the existing buffered row.
   */
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
  ): Promise<void> {
    const now = new Date()
    const metadata = params.metadata ?? {}

    await trx.rawQuery(
      `INSERT INTO "unmatched_provider_receipts" (
         "organizationId",
         "whatsappConfigId",
         "providerMessageId",
         "status",
         "providerStatusAt",
         "errorMessage",
         "metadata",
         "createdAt",
         "updatedAt"
       ) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)
       ON CONFLICT ("organizationId", "providerMessageId")
       DO UPDATE SET
         "status" = EXCLUDED."status",
         "providerStatusAt" = EXCLUDED."providerStatusAt",
         "errorMessage" = EXCLUDED."errorMessage",
         "metadata" = EXCLUDED."metadata",
         "whatsappConfigId" = EXCLUDED."whatsappConfigId",
         "updatedAt" = EXCLUDED."updatedAt"
       WHERE "unmatched_provider_receipts"."providerStatusAt" IS NULL
          OR EXCLUDED."providerStatusAt" >= "unmatched_provider_receipts"."providerStatusAt"`,
      [
        params.organizationId,
        params.whatsappConfigId,
        params.providerMessageId,
        params.status,
        params.providerStatusAt,
        params.errorMessage,
        JSON.stringify(metadata),
        now,
        now,
      ]
    )
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
    const message = await trx
      .from('messages')
      .where('organizationId', params.organizationId)
      .where('providerMessageId', params.providerMessageId)
      .forUpdate()
      .first()

    if (!message) {
      return {
        found: false,
        updated: false,
        previousStatus: 'unknown',
        message: {
          id: '',
          conversationId: '',
          status: 'unknown',
          providerStatusAt: null,
        },
      }
    }

    const previousStatus = message.status as string
    const currentProviderStatusAt = message.providerStatusAt
      ? new Date(message.providerStatusAt as string | Date)
      : null

    const shouldApply = shouldApplyProviderStatus({
      currentStatus: previousStatus,
      incomingStatus: params.status,
      currentProviderStatusAt,
      incomingProviderStatusAt: params.providerStatusAt,
    })

    if (!shouldApply) {
      return {
        found: true,
        updated: false,
        previousStatus,
        message: {
          id: message.id as string,
          conversationId: message.conversationId as string,
          status: previousStatus,
          providerStatusAt: (message.providerStatusAt as Date | string | null) ?? null,
        },
      }
    }

    const patch: Record<string, unknown> = {
      status: params.status,
      providerStatusAt: params.providerStatusAt,
      updatedAt: new Date(),
    }

    if (params.status === 'sent') {
      patch.sentAt = message.sentAt ?? params.providerStatusAt
    } else if (params.status === 'delivered') {
      patch.deliveredAt = params.providerStatusAt
      if (!message.sentAt) patch.sentAt = params.providerStatusAt
    } else if (params.status === 'read') {
      patch.readAt = params.providerStatusAt
      if (!message.deliveredAt) patch.deliveredAt = params.providerStatusAt
      if (!message.sentAt) patch.sentAt = params.providerStatusAt
    } else if (params.status === 'failed') {
      patch.failedAt = params.providerStatusAt
      patch.errorMessage = params.errorMessage
    }

    const [updated] = await trx
      .from('messages')
      .where('id', message.id)
      .where('organizationId', params.organizationId)
      .update(patch)
      .returning(['id', 'conversationId', 'status', 'providerStatusAt'])

    return {
      found: true,
      updated: true,
      previousStatus,
      message: {
        id: updated.id as string,
        conversationId: updated.conversationId as string,
        status: updated.status as string,
        providerStatusAt: (updated.providerStatusAt as Date | string | null) ?? null,
      },
    }
  }
}
