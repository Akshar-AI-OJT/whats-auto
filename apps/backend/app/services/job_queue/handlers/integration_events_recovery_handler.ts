import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import { IntegrationEventsRecoveryService } from '#services/integrations/integration_events_recovery_service'

export type IntegrationEventsRecoveryJobData = {
  limit?: number
}

/**
 * Scheduled sweep: re-emit accepted integration_events older than ~60s.
 */
export function createIntegrationEventsRecoveryHandler(
  recovery: IntegrationEventsRecoveryService = new IntegrationEventsRecoveryService()
): JobHandler {
  return async (job) => {
    const limit = typeof job.data.limit === 'number' ? job.data.limit : undefined
    const result = await recovery.recoverStale({ limit })

    logger.info(
      {
        jobId: job.id,
        woken: result.woken,
        scanned: result.scanned,
      },
      'integrations.events.recovery.completed'
    )
  }
}
