import app from '@adonisjs/core/services/app'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'

/**
 * Enqueue a contact-import wake. Throws on failure so callers can mark the
 * import failed instead of leaving a pending row with no worker.
 */
export async function enqueueContactImport(params: {
  organizationId: string
  importId: string
}): Promise<void> {
  const manager = await app.container.make(JobQueueManager)
  const queue = await manager.ensureStarted()
  await queue.enqueue(
    JOB_NAMES.CONTACT_IMPORT,
    {
      organizationId: params.organizationId,
      importId: params.importId,
    },
    {
      singletonKey: params.importId,
    }
  )
}
