import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import type { CampaignExecutionService } from '#services/campaign_execution_service'

export type CampaignRecoveryJobData = {
  organizationId?: string
  limit?: number
}

export function createCampaignRecoveryHandler(execution: CampaignExecutionService): JobHandler {
  return async (job) => {
    const organizationId =
      typeof job.data.organizationId === 'string' ? job.data.organizationId : undefined
    const limit = typeof job.data.limit === 'number' ? job.data.limit : undefined

    const result = await execution.recoverOverdueCampaigns({
      organizationId,
      limit,
    })

    logger.info(
      {
        jobId: job.id,
        organizationId: organizationId ?? null,
        woken: result.woken,
        scannedOrganizations: result.scannedOrganizations,
      },
      'campaigns.recovery.completed'
    )
  }
}
