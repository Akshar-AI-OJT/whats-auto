import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import { MediaAssetService } from '#services/media_asset_service'

export type MediaPendingUploadCleanupJobData = {
  organizationId?: string
  limit?: number
}

/**
 * Scheduled sweep: fail expired pending_upload rows and delete orphan S3 objects.
 */
export function createMediaPendingUploadCleanupHandler(
  media: MediaAssetService = new MediaAssetService()
): JobHandler {
  return async (job) => {
    const organizationId =
      typeof job.data.organizationId === 'string' ? job.data.organizationId : undefined
    const limit = typeof job.data.limit === 'number' ? job.data.limit : undefined

    const result = await media.expirePendingUploads({
      organizationId,
      limit,
    })

    logger.info(
      {
        jobId: job.id,
        organizationId: organizationId ?? null,
        expired: result.expired,
        scannedOrganizations: result.scannedOrganizations,
      },
      'media.pending_upload.cleanup.completed'
    )
  }
}
