import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import WhatsappOutboundService from '#services/whatsapp_outbound_service'

export type WhatsappOutboundDispatchJobData = {
  organizationId: string
  dispatchId: string
}

/**
 * Wakes Phase 5 executeDispatch. Claim/lease/retry stay on outbound_dispatches.
 */
export function createWhatsappOutboundDispatchHandler(
  outbound: WhatsappOutboundService = new WhatsappOutboundService()
): JobHandler {
  return async (job) => {
    const organizationId = job.data.organizationId
    const dispatchId = job.data.dispatchId

    if (typeof organizationId !== 'string' || typeof dispatchId !== 'string') {
      logger.error(
        { jobId: job.id, dataKeys: Object.keys(job.data) },
        'whatsapp.outbound.dispatch.invalid_payload'
      )
      return
    }

    const result = await outbound.executeDispatch({
      organizationId,
      dispatchId,
      lockOwner: `job:${job.id}`,
    })

    logger.info(
      {
        jobId: job.id,
        organizationId,
        dispatchId,
        outcome: result.outcome,
      },
      'whatsapp.outbound.dispatch.completed'
    )
  }
}
