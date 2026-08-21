import logger from '@adonisjs/core/services/logger'
import type { JobHandler } from '#services/job_queue/contracts/job_queue_driver'
import WhatsappOutboundService from '#services/whatsapp_outbound_service'

export type WhatsappOutboundRecoveryJobData = {
  /** Optional: recover a single tenant. When omitted, scan all organizations. */
  organizationId?: string
  /** Max wake jobs to enqueue per recovery run. */
  limit?: number
}

/**
 * Scheduled sweep: find stuck outbound_dispatches and safely re-enqueue the
 * existing singleton WHATSAPP_OUTBOUND_DISPATCH wake jobs (no duplicate claim logic).
 */
export function createWhatsappOutboundRecoveryHandler(
  outbound: WhatsappOutboundService = new WhatsappOutboundService()
): JobHandler {
  return async (job) => {
    const organizationId =
      typeof job.data.organizationId === 'string' ? job.data.organizationId : undefined
    const limit = typeof job.data.limit === 'number' ? job.data.limit : undefined

    const result = await outbound.recoverStuckDispatches({
      organizationId,
      limit,
    })

    logger.info(
      {
        jobId: job.id,
        organizationId: organizationId ?? null,
        woken: result.woken,
        scannedOrganizations: result.scannedOrganizations,
      },
      'whatsapp.outbound.recovery.completed'
    )
  }
}
