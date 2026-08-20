import app from '@adonisjs/core/services/app'
import type { JobQueueDriver } from '#services/job_queue/contracts/job_queue_driver'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { createWhatsappOutboundDispatchHandler } from '#services/job_queue/handlers/whatsapp_outbound_dispatch_handler'
import { createWhatsappOutboundRecoveryHandler } from '#services/job_queue/handlers/whatsapp_outbound_recovery_handler'
import { createBillingPaymentWebhookHandler } from '#services/job_queue/handlers/billing_payment_webhook_handler'
import { createCampaignExecuteHandler } from '#services/job_queue/handlers/campaign_execute_handler'
import { createCampaignRecoveryHandler } from '#services/job_queue/handlers/campaign_recovery_handler'
import { CampaignExecutionService } from '#services/campaign_execution_service'

/**
 * Register all worker handlers. Add new jobs here as the product grows.
 */
export async function registerJobHandlers(driver: JobQueueDriver): Promise<void> {
  await driver.work(JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH, createWhatsappOutboundDispatchHandler())
  await driver.work(JOB_NAMES.WHATSAPP_OUTBOUND_RECOVERY, createWhatsappOutboundRecoveryHandler())
  await driver.work(JOB_NAMES.BILLING_PAYMENT_WEBHOOK_PROCESS, createBillingPaymentWebhookHandler())

  const campaignExecution = await app.container.make(CampaignExecutionService)
  await driver.work(JOB_NAMES.CAMPAIGN_EXECUTE, createCampaignExecuteHandler(campaignExecution))
  await driver.work(JOB_NAMES.CAMPAIGN_RECOVERY, createCampaignRecoveryHandler(campaignExecution))
}
