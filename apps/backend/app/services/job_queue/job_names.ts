/** Stable job names — keep string values unchanged when swapping drivers. */
export const JOB_NAMES = {
  WHATSAPP_OUTBOUND_DISPATCH: 'whatsapp.outbound.dispatch',
  WHATSAPP_UNMATCHED_RECEIPTS_CLEANUP: 'whatsapp.unmatched_receipts.cleanup',
  BILLING_PAYMENT_WEBHOOK_PROCESS: 'billing.payment_webhook.process',
} as const

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES]
