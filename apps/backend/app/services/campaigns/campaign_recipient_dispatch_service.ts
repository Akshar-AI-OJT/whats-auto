import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import {
  shouldApplyProviderStatus,
  type RankedMessageStatus,
} from '#lib/meta_whatsapp/message_status'
import type { MetaWebhookStatusName } from '#lib/meta_whatsapp/types'

type CampaignRecipientRow = {
  id: string
  broadcastId: string
  status: string
  sentAt: Date | string | null
  deliveredAt: Date | string | null
  readAt: Date | string | null
}

export type CampaignProviderReceiptStatus = MetaWebhookStatusName

/**
 * Delivery-based campaign recipient accounting (broadcast_recipients + broadcasts counters).
 * Recipient timestamps are the source of truth; counters increment only on first stamp.
 */
export class CampaignRecipientDispatchService {
  async isCampaignDispatch(params: {
    organizationId: string
    messageId: string
    clientIdempotencyKey?: string | null
  }): Promise<boolean> {
    if (params.clientIdempotencyKey?.startsWith('campaign:')) {
      return true
    }
    const recipient = await this.#findRecipientByMessageId(params.organizationId, params.messageId)
    return recipient !== null
  }

  async markRecipientSent(
    params: { organizationId: string; messageId: string },
    trx?: TransactionClientContract
  ): Promise<boolean> {
    return this.applyProviderReceipt(
      {
        organizationId: params.organizationId,
        messageId: params.messageId,
        status: 'sent',
        providerStatusAt: new Date(),
      },
      trx
    )
  }

  async markRecipientFailed(
    params: {
      organizationId: string
      messageId: string
      errorMessage: string
    },
    trx?: TransactionClientContract
  ): Promise<boolean> {
    return this.applyProviderReceipt(
      {
        organizationId: params.organizationId,
        messageId: params.messageId,
        status: 'failed',
        providerStatusAt: new Date(),
        errorMessage: params.errorMessage,
      },
      trx
    )
  }

  async applyProviderReceipt(
    params: {
      organizationId: string
      messageId: string
      status: CampaignProviderReceiptStatus
      providerStatusAt: Date
      errorMessage?: string | null
    },
    trx?: TransactionClientContract
  ): Promise<boolean> {
    if (!trx) {
      return db.transaction((inner) => this.applyProviderReceipt(params, inner))
    }

    const status = params.status
    if (status === 'failed') {
      return this.#applyFailed(trx, params)
    }

    return this.#applySuccess(trx, { ...params, status })
  }

  /**
   * Rebuild denormalized campaign counters from recipient timestamps / failed status.
   */
  async recomputeCounters(params: { organizationId: string; campaignId: string }): Promise<void> {
    await db.rawQuery(
      `UPDATE "broadcasts" AS b
       SET
         "sentCount" = sub.sent_count,
         "deliveredCount" = sub.delivered_count,
         "readCount" = sub.read_count,
         "failedCount" = sub.failed_count,
         "updatedAt" = NOW()
       FROM (
         SELECT
           r."broadcastId",
           COUNT(*) FILTER (WHERE r."sentAt" IS NOT NULL)::int AS sent_count,
           COUNT(*) FILTER (WHERE r."deliveredAt" IS NOT NULL)::int AS delivered_count,
           COUNT(*) FILTER (WHERE r."readAt" IS NOT NULL)::int AS read_count,
           COUNT(*) FILTER (WHERE r."status" = 'failed')::int AS failed_count
         FROM "broadcast_recipients" AS r
         WHERE r."organizationId" = ?
           AND r."broadcastId" = ?
         GROUP BY r."broadcastId"
       ) AS sub
       WHERE b."id" = sub."broadcastId"
         AND b."organizationId" = ?`,
      [params.organizationId, params.campaignId, params.organizationId]
    )
  }

  async #applySuccess(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      messageId: string
      status: Exclude<CampaignProviderReceiptStatus, 'failed'>
      providerStatusAt: Date
    }
  ): Promise<boolean> {
    const recipient = await this.#lockRecipientForUpdate(trx, {
      organizationId: params.organizationId,
      messageId: params.messageId,
    })
    if (!recipient) return false

    const currentStatus = mapRecipientStatusForRank(recipient.status)
    if (
      !shouldApplyProviderStatus({
        currentStatus,
        incomingStatus: params.status,
        currentProviderStatusAt: null,
        incomingProviderStatusAt: params.providerStatusAt,
      })
    ) {
      return false
    }

    const at = params.providerStatusAt
    const status = params.status
    const bumpSent =
      recipient.sentAt === null &&
      (status === 'sent' || status === 'delivered' || status === 'read')
    const bumpDelivered =
      recipient.deliveredAt === null && (status === 'delivered' || status === 'read')
    const bumpRead = recipient.readAt === null && status === 'read'

    if (!bumpSent && !bumpDelivered && !bumpRead) {
      return false
    }

    const updated = await trx.rawQuery(
      `WITH marked AS (
         UPDATE "broadcast_recipients" AS r
         SET
           "status" = CASE
             WHEN ?::text = 'read' THEN 'read'
             WHEN ?::text = 'delivered' AND r."status" IS DISTINCT FROM 'read' THEN 'delivered'
             WHEN ?::text = 'sent' AND r."status" NOT IN ('delivered', 'read') THEN 'sent'
             ELSE r."status"
           END,
           "sentAt" = CASE
             WHEN ?::text IN ('sent', 'delivered', 'read') THEN COALESCE(r."sentAt", ?)
             ELSE r."sentAt"
           END,
           "deliveredAt" = CASE
             WHEN ?::text IN ('delivered', 'read') THEN COALESCE(r."deliveredAt", ?)
             ELSE r."deliveredAt"
           END,
           "readAt" = CASE
             WHEN ?::text = 'read' THEN COALESCE(r."readAt", ?)
             ELSE r."readAt"
           END,
           "errorMessage" = NULL
         WHERE r."id" = ?
           AND r."organizationId" = ?
         RETURNING r."broadcastId"
       )
       UPDATE "broadcasts" AS b
       SET
         "sentCount" = b."sentCount" + ?,
         "deliveredCount" = b."deliveredCount" + ?,
         "readCount" = b."readCount" + ?,
         "updatedAt" = NOW()
       FROM marked
       WHERE b."id" = marked."broadcastId"
         AND b."organizationId" = ?
       RETURNING b."id"`,
      [
        status,
        status,
        status,
        status,
        at,
        status,
        at,
        status,
        at,
        recipient.id,
        params.organizationId,
        bumpSent ? 1 : 0,
        bumpDelivered ? 1 : 0,
        bumpRead ? 1 : 0,
        params.organizationId,
      ]
    )

    const row = (updated.rows?.[0] ?? updated[0]) as { id?: string } | undefined
    return Boolean(row?.id)
  }

  async #applyFailed(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      messageId: string
      providerStatusAt: Date
      errorMessage?: string | null
    }
  ): Promise<boolean> {
    const errorMessage = (params.errorMessage ?? 'Send failed').slice(0, 500)
    const recipient = await this.#lockRecipientForUpdate(trx, {
      organizationId: params.organizationId,
      messageId: params.messageId,
    })
    if (!recipient) return false

    if (['sent', 'delivered', 'read'].includes(recipient.status)) {
      await trx
        .from('broadcast_recipients')
        .where('id', recipient.id)
        .where('organizationId', params.organizationId)
        .update({ errorMessage })
      return false
    }

    if (!['queued', 'sending', 'pending'].includes(recipient.status)) {
      return false
    }

    const updated = await trx
      .from('broadcast_recipients')
      .where('id', recipient.id)
      .where('organizationId', params.organizationId)
      .whereIn('status', ['queued', 'sending', 'pending'])
      .update({
        status: 'failed',
        errorMessage,
      })

    if (Number(updated) < 1) return false

    await trx
      .from('broadcasts')
      .where('id', recipient.broadcastId)
      .where('organizationId', params.organizationId)
      .increment('failedCount', 1)

    return true
  }

  async #findRecipientByMessageId(
    organizationId: string,
    messageId: string
  ): Promise<CampaignRecipientRow | null> {
    const row = await db
      .from('broadcast_recipients')
      .where('organizationId', organizationId)
      .where('messageId', messageId)
      .select('id', 'broadcastId', 'status', 'sentAt', 'deliveredAt', 'readAt')
      .first()

    return row ? mapLockedRecipient(row) : null
  }

  async #lockRecipientForUpdate(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      messageId: string
    }
  ): Promise<CampaignRecipientRow | null> {
    const result = await trx.rawQuery(
      `SELECT "id", "broadcastId", "status", "sentAt", "deliveredAt", "readAt"
       FROM "broadcast_recipients"
       WHERE "organizationId" = ?
         AND "messageId" = ?
       FOR UPDATE`,
      [params.organizationId, params.messageId]
    )

    const row = (result.rows?.[0] ?? result[0]) as Record<string, unknown> | undefined
    if (!row) return null
    return mapLockedRecipient(row)
  }
}

function mapLockedRecipient(row: Record<string, unknown>): CampaignRecipientRow {
  return {
    id: row.id as string,
    broadcastId: row.broadcastId as string,
    status: row.status as string,
    sentAt: (row.sentAt as Date | string | null) ?? null,
    deliveredAt: (row.deliveredAt as Date | string | null) ?? null,
    readAt: (row.readAt as Date | string | null) ?? null,
  }
}

function mapRecipientStatusForRank(status: string): RankedMessageStatus | string {
  if (status === 'pending' || status === 'sending' || status === 'queued') return 'queued'
  return status
}
