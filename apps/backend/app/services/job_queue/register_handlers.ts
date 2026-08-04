import type { JobQueueDriver } from '#services/job_queue/contracts/job_queue_driver'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { createWhatsappOutboundDispatchHandler } from '#services/job_queue/handlers/whatsapp_outbound_dispatch_handler'

/**
 * Register all worker handlers. Add new jobs here as the product grows.
 */
export async function registerJobHandlers(driver: JobQueueDriver): Promise<void> {
  await driver.work(JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH, createWhatsappOutboundDispatchHandler())
}
