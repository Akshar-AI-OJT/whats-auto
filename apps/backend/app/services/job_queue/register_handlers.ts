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
import { createAiDebounceTurnHandler } from '#services/job_queue/handlers/ai_debounce_turn_handler'
import { createAiSummarizeConversationHandler } from '#services/job_queue/handlers/ai_summarize_conversation_handler'
import { createAiReindexAllDocumentsHandler } from '#services/job_queue/handlers/ai_reindex_all_documents_handler'

/**
 * Register all worker handlers on the single BullMQ driver.
 */
export async function registerJobHandlers(driver: JobQueueDriver): Promise<void> {
  await driver.work(JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH, createWhatsappOutboundDispatchHandler())
  await driver.work(JOB_NAMES.WHATSAPP_OUTBOUND_RECOVERY, createWhatsappOutboundRecoveryHandler())
  await driver.work(JOB_NAMES.BILLING_PAYMENT_WEBHOOK_PROCESS, createBillingPaymentWebhookHandler())
  await driver.work(
    JOB_NAMES.MEDIA_PENDING_UPLOAD_CLEANUP,
    createMediaPendingUploadCleanupHandler()
  )
  await driver.work(JOB_NAMES.MEDIA_STORAGE_LIFECYCLE, createMediaStorageLifecycleHandler())
  await driver.work(JOB_NAMES.CAMPAIGN_EXECUTE, createCampaignExecuteHandler())
  await driver.work(JOB_NAMES.CAMPAIGN_RECOVERY, createCampaignRecoveryHandler())
  await driver.work(JOB_NAMES.AI_PROCESS_DOCUMENT, createAiProcessDocumentHandler())
  await driver.work(JOB_NAMES.AI_DEBOUNCE_TURN, createAiDebounceTurnHandler())
  await driver.work(JOB_NAMES.AI_SUMMARIZE_CONVERSATION, createAiSummarizeConversationHandler())
  await driver.work(JOB_NAMES.AI_REINDEX_ALL_DOCUMENTS, createAiReindexAllDocumentsHandler())
}
