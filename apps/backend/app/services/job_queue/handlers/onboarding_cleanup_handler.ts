import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import { OnboardingCleanupService } from '#services/onboarding_cleanup_service'

export type OnboardingCleanupJobData = Record<string, never>

/**
 * Daily: sweep expired pre-signup verifications and aged pending_setup orgs.
 */
export function createOnboardingCleanupHandler(
  cleanup: OnboardingCleanupService = new OnboardingCleanupService()
): JobHandler {
  return async (job) => {
    const result = await cleanup.run()
    logger.info(
      {
        jobId: job.id,
        ...result,
      },
      'onboarding.cleanup.completed'
    )
  }
}
