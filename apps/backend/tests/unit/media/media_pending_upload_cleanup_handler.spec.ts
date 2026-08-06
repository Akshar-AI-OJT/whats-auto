import { test } from '@japa/runner'
import { createMediaPendingUploadCleanupHandler } from '#services/job_queue/handlers/media_pending_upload_cleanup_handler'
import type { JobMessage } from '#services/job_queue/contracts/job_queue_driver'
import type { MediaAssetService } from '#services/media_asset_service'

test.group('media.pending_upload.cleanup handler', () => {
  test('forwards job data to MediaAssetService.expirePendingUploads', async ({ assert }) => {
    const calls: Array<{ organizationId?: string; limit?: number }> = []
    const media = {
      expirePendingUploads: async (params?: { organizationId?: string; limit?: number }) => {
        calls.push(params ?? {})
        return { expired: 2, scannedOrganizations: 1 }
      },
    } as unknown as MediaAssetService

    const handler = createMediaPendingUploadCleanupHandler(media)
    await handler({
      id: 'job-1',
      name: 'media.pending_upload.cleanup',
      data: { organizationId: 'org-1', limit: 25 },
    } as JobMessage)

    assert.deepEqual(calls, [{ organizationId: 'org-1', limit: 25 }])
  })
})
