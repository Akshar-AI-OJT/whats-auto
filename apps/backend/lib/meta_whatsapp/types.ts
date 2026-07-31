/**
 * Meta WhatsApp Cloud API types — webhook + Graph.
 * Expand as send/inbox/template features land; keep Graph vs webhook shapes separate.
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

export type MetaTokenExchangeResult = {
  accessToken: string
  tokenType?: string
  expiresIn?: number
}

export type MetaPhoneNumberDetails = {
  id: string
  displayPhoneNumber?: string
  verifiedName?: string
  qualityRating?: string
}

export type MetaSendMessageResult = {
  messageId?: string
  raw: Record<string, unknown>
}

export type MetaGraphErrorBody = {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

export type MetaTemplateComponent = {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS' | string
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | string
  text?: string
  buttons?: Array<Record<string, unknown>>
  example?: Record<string, unknown>
}

export type MetaMessageTemplateItem = {
  id?: string
  name: string
  category: string
  language: string
  status: string
  components: MetaTemplateComponent[]
  rejected_reason?: string
  quality_score?: { score?: string }
}

export type MetaListMessageTemplatesResult = {
  data: MetaMessageTemplateItem[]
  paging?: {
    cursors?: { before?: string; after?: string }
    next?: string
  }
}

export type MetaCreateMessageTemplateResult = {
  id: string
  status?: string
  category?: string
}
