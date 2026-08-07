import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import { CampaignExecutionService } from '#services/campaign_execution_service'

export type CampaignExecuteJobData = {
  organizationId: string
  campaignId: string
}

export function createCampaignExecuteHandler(
  execution: CampaignExecutionService = new CampaignExecutionService()
): JobHandler {
  return async (job) => {
    const organizationId =
      typeof job.data.organizationId === 'string' ? job.data.organizationId : null
    const campaignId = typeof job.data.campaignId === 'string' ? job.data.campaignId : null

    if (!organizationId || !campaignId) {
      logger.warn({ jobId: job.id, data: job.data }, 'campaigns.execute.invalid_payload')
      return
    }

    const result = await execution.executeCampaign({ organizationId, campaignId })

    logger.info(
      {
        jobId: job.id,
        organizationId,
        campaignId,
        claimed: result.claimed,
        remaining: result.remaining,
        finalized: result.finalized,
      },
      'campaigns.execute.completed'
    )
  }
}
