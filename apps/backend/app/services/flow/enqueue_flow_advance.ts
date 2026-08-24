import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import type { FlowAdvanceSessionJobPayload } from '#services/flow/contracts/flow_job_payloads'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'

/**
 * Enqueue a serialized flow advance for one conversation (singletonKey = conversationId).
 */
export async function enqueueFlowAdvanceSession(
  payload: FlowAdvanceSessionJobPayload,
  queue?: JobQueueManager
): Promise<void> {
  try {
    const manager = queue ?? (await app.container.make(JobQueueManager))
    const driver = await manager.ensureStarted()
    await driver.enqueue(
      JOB_NAMES.FLOWS_ADVANCE_SESSION,
      { ...payload },
      {
        singletonKey: payload.conversationId,
      }
    )
  } catch (error) {
    logger.warn(
      {
        organizationId: payload.organizationId,
        conversationId: payload.conversationId,
        err: error instanceof Error ? error.message : 'unknown',
      },
      'flow.advance.enqueue_failed'
    )
  }
}
