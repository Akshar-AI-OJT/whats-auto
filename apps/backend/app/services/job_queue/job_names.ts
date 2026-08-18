/** Stable job names — keep string values unchanged when swapping drivers. */
export const JOB_NAMES = {
  WHATSAPP_OUTBOUND_DISPATCH: 'whatsapp.outbound.dispatch',
  WHATSAPP_OUTBOUND_RECOVERY: 'whatsapp.outbound.recovery',
  BILLING_PAYMENT_WEBHOOK_PROCESS: 'billing.payment_webhook.process',
  MEDIA_PENDING_UPLOAD_CLEANUP: 'media.pending_upload.cleanup',
  MEDIA_STORAGE_LIFECYCLE: 'media.storage.lifecycle',
  CAMPAIGN_EXECUTE: 'campaigns.execute',
  CAMPAIGN_RECOVERY: 'campaigns.recovery',
  AI_PROCESS_DOCUMENT: 'ai.process_document',
  AI_DEBOUNCE_TURN: 'ai.debounce_turn',
  AI_SUMMARIZE_CONVERSATION: 'ai.summarize_conversation',
  AI_REINDEX_ALL_DOCUMENTS: 'ai.reindex_all_documents',
} as const

/** Singleton key so only one platform KB reindex runs at a time. */
export const PLATFORM_AI_REINDEX_SINGLETON_KEY = 'platform-ai-reindex'

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES]

/** Cron for sweeping stuck outbound_dispatches and re-enqueueing wake jobs. */
export const WHATSAPP_OUTBOUND_RECOVERY_CRON = '*/1 * * * *'

/** Cron for expiring abandoned pending media uploads (every 5 minutes). */
export const MEDIA_PENDING_UPLOAD_CLEANUP_CRON = '*/5 * * * *'

/** Cron for soft-delete purge, delete retry, and quota reconciliation. */
export const MEDIA_STORAGE_LIFECYCLE_CRON = '*/15 * * * *'

/** Cron for overdue scheduled/sending campaigns. */
export const CAMPAIGN_RECOVERY_CRON = '*/1 * * * *'

/** Cron for sweeping unprocessed billing webhook events (every 5 minutes). */
export const BILLING_PAYMENT_WEBHOOK_RECOVERY_CRON = '*/5 * * * *'
