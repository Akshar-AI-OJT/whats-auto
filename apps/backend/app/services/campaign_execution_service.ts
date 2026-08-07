import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import CampaignException from '#exceptions/campaign_exception'
import { MediaAssetReferenceRepository } from '#repositories/media_asset_reference_repository'
import { WhatsappWebhookRepository } from '#repositories/whatsapp_webhook_repository'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { runWithTenant } from '#services/tenant_context'
import WhatsappOutboundService from '#services/whatsapp_outbound_service'
import { CampaignService, type CampaignDto } from '#services/campaign_service'

const CAMPAIGN_LIBRARY_RETENTION_DAYS = 30
const RECIPIENT_BATCH_SIZE = 50

export type CampaignRecipientInput = {
  contactIds: string[]
  variables?: Record<string, string>
}

/**
 * Executable campaign workflow: recipient snapshot, schedule/cancel, claim-and-send.
 */
export class CampaignExecutionService {
  constructor(
    protected campaigns: CampaignService = new CampaignService(),
    protected outbound: WhatsappOutboundService = new WhatsappOutboundService(),
    protected webhookRepo: WhatsappWebhookRepository = new WhatsappWebhookRepository(),
    protected mediaReferences: MediaAssetReferenceRepository = new MediaAssetReferenceRepository()
  ) {}

  /**
   * Replace the recipient snapshot for a draft/scheduled campaign.
   */
  async replaceRecipients(params: {
    organizationId: string
    campaignId: string
    contactIds: string[]
    variables?: Record<string, string>
  }): Promise<CampaignDto> {
    return runWithTenant(params.organizationId, async () => {
      const campaign = await this.#loadEditableCampaign(params)

      const uniqueIds = [...new Set(params.contactIds)]
      const contacts = await db
        .from('contacts')
        .where('organizationId', params.organizationId)
        .whereIn('id', uniqueIds)
        .select('id')

      if (contacts.length !== uniqueIds.length) {
        throw CampaignException.invalidReference()
      }

      const now = new Date()
      await db.transaction(async (trx) => {
        await trx
          .from('broadcast_recipients')
          .where('organizationId', params.organizationId)
          .where('broadcastId', params.campaignId)
          .delete()

        if (uniqueIds.length === 0) {
          await trx
            .from('broadcasts')
            .where('id', params.campaignId)
            .where('organizationId', params.organizationId)
            .update({ totalRecipients: 0 })
          return
        }

        await trx.table('broadcast_recipients').insert(
          uniqueIds.map((contactId) => ({
            organizationId: params.organizationId,
            broadcastId: params.campaignId,
            contactId,
            status: 'pending',
            variables: params.variables ?? null,
            createdAt: now,
          }))
        )

        await trx
          .from('broadcasts')
          .where('id', params.campaignId)
          .where('organizationId', params.organizationId)
          .update({ totalRecipients: uniqueIds.length })
      })

      return this.campaigns.getCampaignById({
        campaignId: params.campaignId,
        organizationId: params.organizationId,
      })
    })
  }

  /**
   * Schedule (or immediately start) a campaign after validating recipients + template.
   */
  async scheduleCampaign(params: {
    organizationId: string
    campaignId: string
    scheduledAt?: Date | null
  }): Promise<CampaignDto> {
    return runWithTenant(params.organizationId, async () => {
      const campaign = await this.#loadEditableCampaign(params)

      if (!campaign.messageTemplateId) {
        throw CampaignException.templateRequired()
      }
      if (!campaign.whatsappConfigId) {
        throw CampaignException.whatsappConfigRequired()
      }
      if (Number(campaign.totalRecipients) < 1) {
        throw CampaignException.recipientsRequired()
      }

      await this.#assertApprovedTemplate(
        params.organizationId,
        campaign.messageTemplateId as string
      )
      await this.#assertConnectedConfig(params.organizationId, campaign.whatsappConfigId as string)

      if (campaign.headerMediaAssetId) {
        await this.#assertReadyMediaAsset(
          params.organizationId,
          campaign.headerMediaAssetId as string
        )
      }

      const scheduledAt = params.scheduledAt
        ? new Date(params.scheduledAt)
        : campaign.scheduledAt
          ? new Date(campaign.scheduledAt as string | Date)
          : new Date()

      if (Number.isNaN(scheduledAt.getTime())) {
        throw CampaignException.scheduledAtRequired()
      }

      const now = new Date()
      const isImmediate = scheduledAt.getTime() <= now.getTime() + 1000

      await db.transaction(async (trx) => {
        await trx
          .from('broadcasts')
          .where('id', params.campaignId)
          .where('organizationId', params.organizationId)
          .update({
            status: isImmediate ? 'sending' : 'scheduled',
            scheduledAt,
            cancelledAt: null,
          })

        if (campaign.headerMediaAssetId) {
          await this.mediaReferences.upsert(
            {
              organizationId: params.organizationId,
              mediaAssetId: campaign.headerMediaAssetId as string,
              ownerType: 'campaign',
              ownerId: params.campaignId,
              protectedUntil: null,
            },
            trx
          )
        }
      })

      await this.#enqueueCampaignWake({
        organizationId: params.organizationId,
        campaignId: params.campaignId,
        runAt: isImmediate ? undefined : scheduledAt,
      })

      return this.campaigns.getCampaignById({
        campaignId: params.campaignId,
        organizationId: params.organizationId,
      })
    })
  }

  /**
   * Cancel a campaign:
   * - scheduled → draft
   * - sending → cancelled + finalized (stop in-flight fan-out)
   */
  async cancelCampaign(params: {
    organizationId: string
    campaignId: string
  }): Promise<CampaignDto> {
    return runWithTenant(params.organizationId, async () => {
      const campaign = await this.#loadCampaignRow(params)
      const status = campaign.status as string

      if (status === 'scheduled') {
        await db
          .from('broadcasts')
          .where('id', params.campaignId)
          .where('organizationId', params.organizationId)
          .where('status', 'scheduled')
          .update({
            status: 'draft',
            scheduledAt: null,
            cancelledAt: null,
          })

        return this.campaigns.getCampaignById({
          campaignId: params.campaignId,
          organizationId: params.organizationId,
        })
      }

      if (status !== 'sending') {
        throw CampaignException.notCancellable(status)
      }

      const now = new Date()
      await db
        .from('broadcasts')
        .where('id', params.campaignId)
        .where('organizationId', params.organizationId)
        .update({
          status: 'cancelled',
          cancelledAt: now,
          finalizedAt: now,
        })

      if (campaign.headerMediaAssetId) {
        const protectedUntil = new Date(
          now.getTime() + CAMPAIGN_LIBRARY_RETENTION_DAYS * 24 * 60 * 60 * 1000
        )
        await this.mediaReferences.upsert({
          organizationId: params.organizationId,
          mediaAssetId: campaign.headerMediaAssetId as string,
          ownerType: 'campaign',
          ownerId: params.campaignId,
          protectedUntil,
        })
      }

      return this.campaigns.getCampaignById({
        campaignId: params.campaignId,
        organizationId: params.organizationId,
      })
    })
  }

  /**
   * Worker entry: claim pending recipients and queue template sends.
   */
  async executeCampaign(params: {
    organizationId: string
    campaignId: string
  }): Promise<{ claimed: number; remaining: number; finalized: boolean }> {
    return runWithTenant(params.organizationId, async () => {
      const campaign = await this.#loadCampaignRow(params)
      const status = campaign.status as string

      if (
        status === 'cancelled' ||
        status === 'sent' ||
        status === 'failed' ||
        status === 'deleted' ||
        status === 'draft'
      ) {
        return {
          claimed: 0,
          remaining: 0,
          finalized: status === 'sent' || status === 'cancelled' || status === 'failed',
        }
      }

      if (status === 'scheduled') {
        const scheduledAt = campaign.scheduledAt
          ? new Date(campaign.scheduledAt as string | Date)
          : null
        if (scheduledAt && scheduledAt.getTime() > Date.now() + 1000) {
          return { claimed: 0, remaining: Number(campaign.totalRecipients), finalized: false }
        }
        await db
          .from('broadcasts')
          .where('id', params.campaignId)
          .where('organizationId', params.organizationId)
          .where('status', 'scheduled')
          .update({ status: 'sending' })
      }

      if (!campaign.messageTemplateId || !campaign.whatsappConfigId) {
        await this.#failCampaign(params, 'Campaign is missing template or WhatsApp configuration')
        return { claimed: 0, remaining: 0, finalized: true }
      }

      let claimed = 0
      for (;;) {
        const batch = await this.#claimRecipientBatch({
          organizationId: params.organizationId,
          campaignId: params.campaignId,
          limit: RECIPIENT_BATCH_SIZE,
        })
        if (batch.length === 0) break

        for (const recipient of batch) {
          claimed += 1
          try {
            await this.#sendRecipient({
              organizationId: params.organizationId,
              campaignId: params.campaignId,
              whatsappConfigId: campaign.whatsappConfigId as string,
              messageTemplateId: campaign.messageTemplateId as string,
              headerMediaAssetId: (campaign.headerMediaAssetId as string | null) ?? null,
              recipient,
            })
          } catch (error) {
            logger.warn(
              {
                campaignId: params.campaignId,
                recipientId: recipient.id,
                err: error instanceof Error ? error.message : 'unknown',
              },
              'campaigns.execute.recipient_failed'
            )
            await this.#markRecipientFailed({
              organizationId: params.organizationId,
              campaignId: params.campaignId,
              recipientId: recipient.id,
              errorMessage: error instanceof Error ? error.message : 'Send failed',
            })
          }
        }
      }

      const remaining = await this.#countPendingRecipients(params)
      if (remaining === 0) {
        await this.#finalizeCampaign(params)
        return { claimed, remaining: 0, finalized: true }
      }

      // More work left (should be rare with full claim loop) — re-wake.
      await this.#enqueueCampaignWake({
        organizationId: params.organizationId,
        campaignId: params.campaignId,
      })

      return { claimed, remaining, finalized: false }
    })
  }

  /**
   * Recovery: wake overdue scheduled campaigns and in-progress campaigns with pending recipients.
   */
  async recoverOverdueCampaigns(params?: {
    organizationId?: string
    limit?: number
  }): Promise<{ woken: number; scannedOrganizations: number }> {
    const limit = params?.limit ?? 50
    const organizationIds = params?.organizationId
      ? [params.organizationId]
      : await db
          .from('organizations')
          .select('id')
          .then((rows) => rows.map((row) => row.id as string))

    let woken = 0
    let remaining = limit
    const now = new Date()

    for (const organizationId of organizationIds) {
      if (remaining <= 0) break

      const due = await runWithTenant(organizationId, async () => {
        // Reclaim recipients stuck in `sending` without a message (worker crash).
        await db
          .from('broadcast_recipients')
          .where('organizationId', organizationId)
          .where('status', 'sending')
          .whereNull('messageId')
          .where('createdAt', '<', new Date(now.getTime() - 10 * 60 * 1000))
          .update({ status: 'pending' })

        return db
          .from('broadcasts')
          .where('organizationId', organizationId)
          .where((q) => {
            q.where((scheduled) => {
              scheduled
                .where('status', 'scheduled')
                .whereNotNull('scheduledAt')
                .where('scheduledAt', '<=', now)
            }).orWhere((sending) => {
              sending.where('status', 'sending')
            })
          })
          .orderBy('updatedAt', 'asc')
          .limit(remaining)
          .select('id')
      })

      for (const row of due) {
        await this.#enqueueCampaignWake({
          organizationId,
          campaignId: row.id as string,
        })
        woken += 1
        remaining -= 1
        if (remaining <= 0) break
      }
    }

    return { woken, scannedOrganizations: organizationIds.length }
  }

  async #sendRecipient(params: {
    organizationId: string
    campaignId: string
    whatsappConfigId: string
    messageTemplateId: string
    headerMediaAssetId: string | null
    recipient: { id: string; contactId: string; variables: Record<string, string> | null }
  }): Promise<void> {
    const conversation = await db.transaction(async (trx) => {
      return this.webhookRepo.findOrCreateConversation(trx, {
        organizationId: params.organizationId,
        whatsappConfigId: params.whatsappConfigId,
        contactId: params.recipient.contactId,
      })
    })

    // Reopen closed conversations for template campaign sends.
    if (conversation.status === 'closed') {
      await db
        .from('conversations')
        .where('id', conversation.id)
        .where('organizationId', params.organizationId)
        .update({ status: 'open', closedAt: null, updatedAt: new Date() })
    }

    const queued = await this.outbound.queueTemplate({
      organizationId: params.organizationId,
      conversationId: conversation.id,
      templateId: params.messageTemplateId,
      parameters: params.recipient.variables ?? undefined,
      headerMediaAssetId: params.headerMediaAssetId,
      channel: 'system',
      idempotencyKey: `campaign:${params.campaignId}:recipient:${params.recipient.id}`,
    })

    const now = new Date()
    await db.transaction(async (trx) => {
      await trx
        .from('broadcast_recipients')
        .where('id', params.recipient.id)
        .where('organizationId', params.organizationId)
        .update({
          status: 'queued',
          messageId: queued.messageId,
          sentAt: now,
          errorMessage: null,
        })

      await trx.rawQuery(
        `UPDATE "broadcasts"
         SET "sentCount" = "sentCount" + 1, "updatedAt" = ?
         WHERE "id" = ? AND "organizationId" = ?`,
        [now, params.campaignId, params.organizationId]
      )
    })
  }

  async #claimRecipientBatch(params: {
    organizationId: string
    campaignId: string
    limit: number
  }): Promise<Array<{ id: string; contactId: string; variables: Record<string, string> | null }>> {
    return db.transaction(async (trx) => {
      const result = await trx.rawQuery(
        `WITH claimed AS (
           SELECT "id"
           FROM "broadcast_recipients"
           WHERE "organizationId" = ?
             AND "broadcastId" = ?
             AND "status" = 'pending'
           ORDER BY "createdAt" ASC
           FOR UPDATE SKIP LOCKED
           LIMIT ?
         )
         UPDATE "broadcast_recipients" AS r
         SET "status" = 'sending'
         FROM claimed
         WHERE r."id" = claimed."id"
         RETURNING r."id", r."contactId", r."variables"`,
        [params.organizationId, params.campaignId, params.limit]
      )

      const rows = (result.rows ?? result) as Array<Record<string, unknown>>
      return rows.map((row) => ({
        id: row.id as string,
        contactId: row.contactId as string,
        variables: (row.variables as Record<string, string> | null) ?? null,
      }))
    })
  }

  async #markRecipientFailed(params: {
    organizationId: string
    campaignId: string
    recipientId: string
    errorMessage: string
  }): Promise<void> {
    const now = new Date()
    await db.transaction(async (trx) => {
      await trx
        .from('broadcast_recipients')
        .where('id', params.recipientId)
        .where('organizationId', params.organizationId)
        .update({
          status: 'failed',
          errorMessage: params.errorMessage.slice(0, 500),
        })

      await trx.rawQuery(
        `UPDATE "broadcasts"
         SET "failedCount" = "failedCount" + 1, "updatedAt" = ?
         WHERE "id" = ? AND "organizationId" = ?`,
        [now, params.campaignId, params.organizationId]
      )
    })
  }

  async #countPendingRecipients(params: {
    organizationId: string
    campaignId: string
  }): Promise<number> {
    const row = await db
      .from('broadcast_recipients')
      .where('organizationId', params.organizationId)
      .where('broadcastId', params.campaignId)
      .where('status', 'pending')
      .count('* as total')
      .first()
    return Number(row?.total ?? 0)
  }

  async #finalizeCampaign(params: { organizationId: string; campaignId: string }): Promise<void> {
    const now = new Date()
    const campaign = await this.#loadCampaignRow(params)
    const failedCount = Number(campaign.failedCount ?? 0)
    const sentCount = Number(campaign.sentCount ?? 0)
    const status = failedCount > 0 && sentCount === 0 ? 'failed' : 'sent'

    await db
      .from('broadcasts')
      .where('id', params.campaignId)
      .where('organizationId', params.organizationId)
      .whereIn('status', ['sending', 'scheduled'])
      .update({
        status,
        finalizedAt: now,
      })

    if (campaign.headerMediaAssetId) {
      const protectedUntil = new Date(
        now.getTime() + CAMPAIGN_LIBRARY_RETENTION_DAYS * 24 * 60 * 60 * 1000
      )
      await this.mediaReferences.upsert({
        organizationId: params.organizationId,
        mediaAssetId: campaign.headerMediaAssetId as string,
        ownerType: 'campaign',
        ownerId: params.campaignId,
        protectedUntil,
      })
    }
  }

  async #failCampaign(
    params: { organizationId: string; campaignId: string },
    reason: string
  ): Promise<void> {
    const now = new Date()
    await db
      .from('broadcasts')
      .where('id', params.campaignId)
      .where('organizationId', params.organizationId)
      .update({
        status: 'failed',
        finalizedAt: now,
      })
    logger.warn(
      { campaignId: params.campaignId, organizationId: params.organizationId, reason },
      'campaigns.execute.failed'
    )
  }

  async #enqueueCampaignWake(params: {
    organizationId: string
    campaignId: string
    runAt?: Date
  }): Promise<void> {
    try {
      const manager = await app.container.make(JobQueueManager)
      const queue = await manager.ensureStarted()
      await queue.enqueue(
        JOB_NAMES.CAMPAIGN_EXECUTE,
        {
          organizationId: params.organizationId,
          campaignId: params.campaignId,
        },
        {
          runAt: params.runAt,
          singletonKey: params.campaignId,
        }
      )
    } catch (error) {
      logger.error(
        {
          campaignId: params.campaignId,
          organizationId: params.organizationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'campaigns.enqueue_failed'
      )
    }
  }

  async #loadEditableCampaign(params: {
    organizationId: string
    campaignId: string
  }): Promise<Record<string, unknown>> {
    const campaign = await this.#loadCampaignRow(params)
    const status = campaign.status as string
    if (status !== 'draft' && status !== 'scheduled') {
      throw CampaignException.notEditable(status)
    }
    return campaign
  }

  async #loadCampaignRow(params: {
    organizationId: string
    campaignId: string
  }): Promise<Record<string, unknown>> {
    const row = await db
      .from('broadcasts')
      .where('id', params.campaignId)
      .where('organizationId', params.organizationId)
      .whereNot('status', 'deleted')
      .first()

    if (!row) {
      throw CampaignException.notFound()
    }
    return row
  }

  async #assertApprovedTemplate(organizationId: string, templateId: string): Promise<void> {
    const template = await db
      .from('message_templates')
      .where('id', templateId)
      .where('organizationId', organizationId)
      .select('id', 'status')
      .first()
    if (!template) {
      throw CampaignException.messageTemplateNotFound()
    }
    if (String(template.status).toLowerCase() !== 'approved') {
      throw CampaignException.messageTemplateNotFound()
    }
  }

  async #assertConnectedConfig(organizationId: string, whatsappConfigId: string): Promise<void> {
    const config = await db
      .from('whatsapp_configs')
      .where('id', whatsappConfigId)
      .where('organizationId', organizationId)
      .select('id', 'status')
      .first()
    if (!config) {
      throw CampaignException.whatsappConfigNotFound()
    }
    if (config.status !== 'connected') {
      throw CampaignException.whatsappConfigNotFound()
    }
  }

  async #assertReadyMediaAsset(organizationId: string, mediaAssetId: string): Promise<void> {
    const asset = await db
      .from('media_assets')
      .where('id', mediaAssetId)
      .where('organizationId', organizationId)
      .where('state', 'ready')
      .select('id')
      .first()
    if (!asset) {
      throw CampaignException.invalidReference()
    }
  }
}
