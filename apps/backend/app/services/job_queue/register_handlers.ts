import app from '@adonisjs/core/services/app'
import type { JobQueueDriver } from '#services/job_queue/contracts/job_queue_driver'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { createWhatsappOutboundDispatchHandler } from '#services/job_queue/handlers/whatsapp_outbound_dispatch_handler'
import { createWhatsappOutboundRecoveryHandler } from '#services/job_queue/handlers/whatsapp_outbound_recovery_handler'
import { createBillingPaymentWebhookHandler } from '#services/job_queue/handlers/billing_payment_webhook_handler'
import { createMediaPendingUploadCleanupHandler } from '#services/job_queue/handlers/media_pending_upload_cleanup_handler'
import { createMediaStorageLifecycleHandler } from '#services/job_queue/handlers/media_storage_lifecycle_handler'
import { createCampaignExecuteHandler } from '#services/job_queue/handlers/campaign_execute_handler'
import { createCampaignRecoveryHandler } from '#services/job_queue/handlers/campaign_recovery_handler'
import { createAiProcessDocumentHandler } from '#services/job_queue/handlers/ai_process_document_handler'
import { createAiSummarizeConversationHandler } from '#services/job_queue/handlers/ai_summarize_conversation_handler'
import { createAiReindexAllDocumentsHandler } from '#services/job_queue/handlers/ai_reindex_all_documents_handler'
import { createIntegrationEventsRecoveryHandler } from '#services/job_queue/handlers/integration_events_recovery_handler'
import { createFlowsAdvanceSessionHandler } from '#services/job_queue/handlers/flows_advance_session_handler'
import { createFlowsSessionRecoveryHandler } from '#services/job_queue/handlers/flows_session_recovery_handler'
import { CampaignExecutionService } from '#services/campaign_execution_service'

/**
 * Register all worker handlers on the single BullMQ driver.
 */
export async function registerJobHandlers(driver: JobQueueDriver): Promise<void> {
  const campaignExecution = await app.container.make(CampaignExecutionService)

  await driver.work(JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH, createWhatsappOutboundDispatchHandler())
  await driver.work(JOB_NAMES.WHATSAPP_OUTBOUND_RECOVERY, createWhatsappOutboundRecoveryHandler())
  await driver.work(JOB_NAMES.BILLING_PAYMENT_WEBHOOK_PROCESS, createBillingPaymentWebhookHandler())
  await driver.work(
    JOB_NAMES.MEDIA_PENDING_UPLOAD_CLEANUP,
    createMediaPendingUploadCleanupHandler()
  )
  await driver.work(JOB_NAMES.MEDIA_STORAGE_LIFECYCLE, createMediaStorageLifecycleHandler())
  await driver.work(JOB_NAMES.CAMPAIGN_EXECUTE, createCampaignExecuteHandler(campaignExecution))
  await driver.work(JOB_NAMES.CAMPAIGN_RECOVERY, createCampaignRecoveryHandler(campaignExecution))
  await driver.work(JOB_NAMES.AI_PROCESS_DOCUMENT, createAiProcessDocumentHandler())
  await driver.work(JOB_NAMES.AI_SUMMARIZE_CONVERSATION, createAiSummarizeConversationHandler())
  await driver.work(JOB_NAMES.AI_REINDEX_ALL_DOCUMENTS, createAiReindexAllDocumentsHandler())
  await driver.work(JOB_NAMES.INTEGRATION_EVENTS_RECOVERY, createIntegrationEventsRecoveryHandler())
  await driver.work(JOB_NAMES.FLOWS_ADVANCE_SESSION, createFlowsAdvanceSessionHandler())
  await driver.work(JOB_NAMES.FLOWS_SESSION_RECOVERY, createFlowsSessionRecoveryHandler())
}
