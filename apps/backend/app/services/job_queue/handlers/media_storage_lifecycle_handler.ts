import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import { StorageLifecycleService } from '#services/storage_lifecycle_service'

export type MediaStorageLifecycleJobData = {
  organizationId?: string
  limit?: number
}

/**
 * Scheduled sweep: expire pending uploads, purge soft-deletes, retry S3 deletes, reconcile quota.
 */
export function createMediaStorageLifecycleHandler(
  lifecycle: StorageLifecycleService = new StorageLifecycleService()
): JobHandler {
  return async (job) => {
    const organizationId =
      typeof job.data.organizationId === 'string' ? job.data.organizationId : undefined
    const limit = typeof job.data.limit === 'number' ? job.data.limit : undefined

    const expired = await lifecycle.expirePendingUploads({ organizationId, limit })
    const purged = await lifecycle.purgeDueSoftDeletes({ organizationId, limit })
    const retried = await lifecycle.retryFailedDeletes({ organizationId, limit })
    const reconciled = await lifecycle.reconcileQuota({
      organizationId,
      limit: organizationId ? 1 : 25,
    })

    logger.info(
      {
        jobId: job.id,
        organizationId: organizationId ?? null,
        expired: expired.expired,
        purged: purged.purged,
        purgeFailed: purged.failed,
        deleteRetries: retried.retried,
        deleteRetrySucceeded: retried.succeeded,
        quotaReconciled: reconciled.reconciled,
      },
      'media.storage.lifecycle.completed'
    )
  }
}
