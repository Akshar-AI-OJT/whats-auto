import { inject } from '@adonisjs/core'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { CampaignAttributionRepository } from '#repositories/campaign_attribution_repository'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'

export type CampaignAttributionSource = 'context' | 'window' | 'organic'

export type CampaignAttributionResult = {
  campaignId: string | null
  source: CampaignAttributionSource
  stampedConversation: boolean
  countedReply: boolean
}

@inject()
export default class CampaignAttributionService {
  constructor(
    private recipients: CampaignAttributionRepository = new CampaignAttributionRepository(),
    private platform: PlatformAiConfigService = new PlatformAiConfigService()
  ) {}

  async attributeInbound(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      conversationId: string
      contactId: string
      occurredAt: Date
      contextProviderMessageId: string | null
    }
  ): Promise<CampaignAttributionResult> {
    const resolved = await this.#resolveRecipient(trx, params)
    if (!resolved) {
      return {
        campaignId: null,
        source: 'organic',
        stampedConversation: false,
        countedReply: false,
      }
    }
    const { recipient, source } = resolved

    const stampedConversation = await this.recipients.stampConversationIfEmpty(trx, {
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      campaignId: recipient.broadcastId,
    })

    const countedReply = await this.recipients.markRecipientRepliedOnce(trx, {
      organizationId: params.organizationId,
      recipientId: recipient.id,
      repliedAt: params.occurredAt,
    })
    if (countedReply) {
      await this.recipients.incrementBroadcastRepliedCount(trx, {
        organizationId: params.organizationId,
        campaignId: recipient.broadcastId,
      })
    }

    return {
      campaignId: recipient.broadcastId,
      source,
      stampedConversation,
      countedReply,
    }
  }

  async #resolveRecipient(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      contactId: string
      occurredAt: Date
      contextProviderMessageId: string | null
    }
  ): Promise<{
    recipient: { id: string; broadcastId: string }
    source: Exclude<CampaignAttributionSource, 'organic'>
  } | null> {
    if (params.contextProviderMessageId) {
      const fromContext = await this.recipients.findRecipientByOutboundWamid(trx, {
        organizationId: params.organizationId,
        providerMessageId: params.contextProviderMessageId,
      })
      if (fromContext) return { recipient: fromContext, source: 'context' }
    }

    const config = await this.platform.get()
    const since = new Date(
      params.occurredAt.getTime() - config.campaignAttributionWindowHours * 60 * 60 * 1000
    )

    const fromWindow = await this.recipients.findLatestRecipientInWindow(trx, {
      organizationId: params.organizationId,
      contactId: params.contactId,
      since,
      until: params.occurredAt,
    })
    return fromWindow ? { recipient: fromWindow, source: 'window' } : null
  }
}
