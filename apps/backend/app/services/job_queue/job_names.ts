/** Stable job names — keep string values unchanged when swapping drivers. */
export const JOB_NAMES = {
  WHATSAPP_OUTBOUND_DISPATCH: 'whatsapp.outbound.dispatch',
  WHATSAPP_OUTBOUND_RECOVERY: 'whatsapp.outbound.recovery',
  WHATSAPP_UNMATCHED_RECEIPTS_CLEANUP: 'whatsapp.unmatched_receipts.cleanup',
  BILLING_PAYMENT_WEBHOOK_PROCESS: 'billing.payment_webhook.process',
  CAMPAIGN_EXECUTE: 'campaign.execute',
  CAMPAIGN_RECOVERY: 'campaign.recovery',
} as const

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES]

/** Cron for sweeping stuck outbound_dispatches and re-enqueueing wake jobs. */
export const WHATSAPP_OUTBOUND_RECOVERY_CRON = '*/1 * * * *'

/** Cron for sweeping overdue scheduled campaigns and re-enqueueing wake jobs. */
export const CAMPAIGN_RECOVERY_CRON = '*/1 * * * *'
