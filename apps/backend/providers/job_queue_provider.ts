import type { ApplicationService } from '@adonisjs/core/types'
import { MediaAssetReferenceRepository } from '#repositories/media_asset_reference_repository'
import { CampaignAttributionRepository } from '#repositories/campaign_attribution_repository'
import { WhatsappWebhookRepository } from '#repositories/whatsapp_webhook_repository'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import WhatsappOutboundService from '#services/whatsapp_outbound_service'

/**
 * Binds JobQueueManager. Does not start consumers — only the worker entrypoint does.
 * Also binds campaign-domain deps that are not auto-resolvable (Meta graph client defaults).
 */
export default class JobQueueProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(JobQueueManager, () => new JobQueueManager(this.app))
    this.app.container.bind(WhatsappOutboundService, () => new WhatsappOutboundService())
    this.app.container.bind(
      MediaAssetReferenceRepository,
      () => new MediaAssetReferenceRepository()
    )
    this.app.container.bind(WhatsappWebhookRepository, () => new WhatsappWebhookRepository())
    this.app.container.bind(
      CampaignAttributionRepository,
      () => new CampaignAttributionRepository()
    )
  }

  async shutdown() {
    try {
      const manager = await this.app.container.make(JobQueueManager)
      await manager.stop()
    } catch {
      // Binding may be unavailable during early abort.
    }
  }
}
