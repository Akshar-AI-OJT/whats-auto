/**
 * Minimal Meta WhatsApp Cloud API webhook payload shapes.
 * Expand as Phase 3+ needs message / status / template fields.
 */

export type MetaWebhookChange = {
  field?: string
  value?: Record<string, unknown>
}

export type MetaWebhookEntry = {
  id?: string
  changes?: MetaWebhookChange[]
}

export type MetaWebhookPayload = {
  object?: string
  entry?: MetaWebhookEntry[]
}
