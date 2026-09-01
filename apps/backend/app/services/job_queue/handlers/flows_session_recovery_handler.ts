import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import FlowSessionLifecycleService from '#services/flow/flow_session_lifecycle_service'

export type FlowsSessionRecoveryJobData = {
  organizationId?: string
  limit?: number
}

/**
 * Scheduled sweep: apply onExpiry to sessions past expiresAt, then purge old logs.
 */
export function createFlowsSessionRecoveryHandler(
  lifecycle: FlowSessionLifecycleService = new FlowSessionLifecycleService()
): JobHandler {
  return async (job) => {
    const organizationId =
      typeof job.data.organizationId === 'string' ? job.data.organizationId : undefined
    const limit = typeof job.data.limit === 'number' ? job.data.limit : undefined

    const expired = await lifecycle.recoverExpiredSessions({ organizationId, limit })
    const purged = await lifecycle.purgeOldLogs({ organizationId, limit })

    logger.info(
      {
        jobId: job.id,
        organizationId: organizationId ?? null,
        recovered: expired.recovered,
        scannedOrganizations: expired.scannedOrganizations,
        logsDeleted: purged.deleted,
      },
      'flows.session.recovery.completed'
    )
  }
}
