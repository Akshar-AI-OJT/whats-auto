import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'

/**
 * Enqueue a campaign execute wake. Throws on failure so callers can
 * compensate persisted schedule/send status instead of orphaning jobs.
 */
export async function enqueueCampaignWake(params: {
  organizationId: string
  campaignId: string
  runAt?: Date
}): Promise<void> {
  const manager = await app.container.make(JobQueueManager)
  const queue = await manager.ensureStarted()
  await queue.enqueue(
    JOB_NAMES.CAMPAIGN_EXECUTE,
    {
      organizationId: params.organizationId,
      campaignId: params.campaignId,
    },
    {
      ...(params.runAt ? { runAt: params.runAt } : {}),
      singletonKey: params.campaignId,
    }
  )
}

/**
 * Best-effort removal of a delayed campaign execute job.
 * Logs when the driver does not implement `remove`.
 */
export async function removeCampaignWake(params: {
  organizationId: string
  campaignId: string
}): Promise<void> {
  try {
    const manager = await app.container.make(JobQueueManager)
    const queue = await manager.ensureStarted()
    if (typeof queue.remove !== 'function') {
      logger.warn(
        {
          campaignId: params.campaignId,
          organizationId: params.organizationId,
        },
        'campaigns.unregister_schedule_remove_unsupported'
      )
      return
    }
    await queue.remove(JOB_NAMES.CAMPAIGN_EXECUTE, params.campaignId)
  } catch (error) {
    logger.warn(
      {
        campaignId: params.campaignId,
        organizationId: params.organizationId,
        err: error instanceof Error ? error.message : 'unknown',
      },
      'campaigns.unregister_schedule_failed'
    )
  }
}
