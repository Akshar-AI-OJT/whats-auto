import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export type AttributionRecipientRow = {
  id: string
  broadcastId: string
  repliedAt: Date | string | null
}

export class CampaignAttributionRepository {
  async findRecipientByOutboundWamid(
    trx: TransactionClientContract,
    params: { organizationId: string; providerMessageId: string }
  ): Promise<AttributionRecipientRow | null> {
    const row = await trx
      .from('messages as m')
      .join('broadcast_recipients as r', function () {
        this.on('r.messageId', 'm.id').andOn('r.organizationId', 'm.organizationId')
      })
      .where('m.organizationId', params.organizationId)
      .where('m.providerMessageId', params.providerMessageId)
      .select('r.id', 'r.broadcastId', 'r.repliedAt')
      .first()

    return row ? mapRecipient(row) : null
  }

  async findLatestRecipientInWindow(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      contactId: string
      since: Date
      until: Date
    }
  ): Promise<AttributionRecipientRow | null> {
    const row = await trx
      .from('broadcast_recipients')
      .where('organizationId', params.organizationId)
      .where('contactId', params.contactId)
      .whereNotNull('sentAt')
      .where('sentAt', '>=', params.since)
      .where('sentAt', '<=', params.until)
      .orderBy('sentAt', 'desc')
      .select('id', 'broadcastId', 'repliedAt')
      .first()

    return row ? mapRecipient(row) : null
  }

  async stampConversationIfEmpty(
    trx: TransactionClientContract,
    params: { organizationId: string; conversationId: string; campaignId: string }
  ): Promise<boolean> {
    const updated = await trx
      .from('conversations')
      .where('id', params.conversationId)
      .where('organizationId', params.organizationId)
      .whereNull('attributedCampaignId')
      .update({ attributedCampaignId: params.campaignId })

    return Number(updated) > 0
  }

  async markRecipientRepliedOnce(
    trx: TransactionClientContract,
    params: { organizationId: string; recipientId: string; repliedAt: Date }
  ): Promise<boolean> {
    const updated = await trx
      .from('broadcast_recipients')
      .where('id', params.recipientId)
      .where('organizationId', params.organizationId)
      .whereNull('repliedAt')
      .update({ repliedAt: params.repliedAt })

    return Number(updated) > 0
  }

  async incrementBroadcastRepliedCount(
    trx: TransactionClientContract,
    params: { organizationId: string; campaignId: string }
  ): Promise<void> {
    await trx.rawQuery(
      `UPDATE "broadcasts"
       SET "repliedCount" = "repliedCount" + 1, "updatedAt" = NOW()
       WHERE "id" = ? AND "organizationId" = ?`,
      [params.campaignId, params.organizationId]
    )
  }
}

function mapRecipient(row: Record<string, unknown>): AttributionRecipientRow {
  return {
    id: row.id as string,
    broadcastId: row.broadcastId as string,
    repliedAt: (row.repliedAt as Date | string | null) ?? null,
  }
}
