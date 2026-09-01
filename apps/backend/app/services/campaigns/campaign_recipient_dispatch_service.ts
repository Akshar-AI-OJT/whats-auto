import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

type CampaignRecipientRow = {
  id: string
  broadcastId: string
  status: string
}

/**
 * Delivery-based campaign recipient accounting (broadcast_recipients + broadcasts counters).
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

  async markRecipientSent(params: { organizationId: string; messageId: string }): Promise<boolean> {
    const now = new Date()
    return db.transaction(async (trx) => {
      const recipient = await this.#lockRecipientForUpdate(trx, {
        organizationId: params.organizationId,
        messageId: params.messageId,
        statuses: ['queued', 'sending'],
      })
      if (!recipient) return false

      const updated = await trx
        .from('broadcast_recipients')
        .where('id', recipient.id)
        .where('organizationId', params.organizationId)
        .whereIn('status', ['queued', 'sending'])
        .update({
          status: 'sent',
          sentAt: now,
          errorMessage: null,
        })

      if (Number(updated) < 1) return false

      await trx
        .from('broadcasts')
        .where('id', recipient.broadcastId)
        .where('organizationId', params.organizationId)
        .increment('sentCount', 1)

      return true
    })
  }

  async markRecipientFailed(params: {
    organizationId: string
    messageId: string
    errorMessage: string
  }): Promise<boolean> {
    const errorMessage = params.errorMessage.slice(0, 500)
    return db.transaction(async (trx) => {
      const recipient = await this.#lockRecipientForUpdate(trx, {
        organizationId: params.organizationId,
        messageId: params.messageId,
        statuses: ['queued', 'sending'],
      })
      if (!recipient) return false

      const updated = await trx
        .from('broadcast_recipients')
        .where('id', recipient.id)
        .where('organizationId', params.organizationId)
        .whereIn('status', ['queued', 'sending'])
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
    })
  }

  async #findRecipientByMessageId(
    organizationId: string,
    messageId: string
  ): Promise<CampaignRecipientRow | null> {
    const row = await db
      .from('broadcast_recipients')
      .where('organizationId', organizationId)
      .where('messageId', messageId)
      .select('id', 'broadcastId', 'status')
      .first()

    if (!row) return null
    return {
      id: row.id as string,
      broadcastId: row.broadcastId as string,
      status: row.status as string,
    }
  }

  async #lockRecipientForUpdate(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      messageId: string
      statuses: string[]
    }
  ): Promise<CampaignRecipientRow | null> {
    const result = await trx.rawQuery(
      `SELECT "id", "broadcastId", "status"
       FROM "broadcast_recipients"
       WHERE "organizationId" = ?
         AND "messageId" = ?
         AND "status" = ANY(?)
       FOR UPDATE`,
      [params.organizationId, params.messageId, params.statuses]
    )

    const row = (result.rows?.[0] ?? result[0]) as Record<string, unknown> | undefined
    if (!row) return null

    return {
      id: row.id as string,
      broadcastId: row.broadcastId as string,
      status: row.status as string,
    }
  }
}
