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

export type MetaWebhookContact = {
  wa_id: string
  profile?: {
    name?: string
  }
}

export type MetaWebhookText = {
  body?: string
}

export type MetaWebhookMedia = {
  id?: string
  mime_type?: string
  caption?: string
  filename?: string
  sha256?: string
}

export type MetaWebhookLocation = {
  latitude?: number
  longitude?: number
  name?: string
  address?: string
  url?: string
}

export type MetaWebhookInteractive = {
  type?: string
  button_reply?: {
    id?: string
    title?: string
  }
  list_reply?: {
    id?: string
    title?: string
    description?: string
  }
}

export type MetaWebhookError = {
  code?: number
  title?: string
  message?: string
  error_data?: {
    details?: string
  }
}

export type MetaWebhookMessageType =
  'text' | 'image' | 'video' | 'document' | 'location' | 'interactive' | string

export type MetaWebhookMessage = {
  from: string
  id: string
  timestamp: string
  type: MetaWebhookMessageType
  text?: MetaWebhookText
  image?: MetaWebhookMedia
  video?: MetaWebhookMedia
  document?: MetaWebhookMedia
  location?: MetaWebhookLocation
  interactive?: MetaWebhookInteractive
  errors?: MetaWebhookError[]
}

export type MetaWebhookStatusName = 'sent' | 'delivered' | 'read' | 'failed'

export type MetaWebhookStatus = {
  id: string
  status: MetaWebhookStatusName
  timestamp: string
  recipient_id?: string
  errors?: MetaWebhookError[]
}

export type MetaWebhookValue = {
  messaging_product?: string
  metadata?: {
    display_phone_number?: string
    phone_number_id?: string
  }
  contacts?: MetaWebhookContact[]
  messages?: MetaWebhookMessage[]
  statuses?: MetaWebhookStatus[]
}

/** Canonical provider extras stored on messages.metadata (not interactivePayload). */
export type MessageMetadataMedia = {
  id?: string
  mimeType?: string
  caption?: string
  filename?: string
  sha256?: string
}

export type MessageMetadataLocation = {
  latitude?: number
  longitude?: number
  name?: string
  address?: string
  url?: string
}

export type MessageMetadataInteractive = {
  type?: string
  buttonReply?: {
    id?: string
    title?: string
  }
  listReply?: {
    id?: string
    title?: string
    description?: string
  }
}

export type MessageMetadataError = {
  code?: number
  title?: string
  message?: string
  details?: string
}

export type MessageMetadata = {
  media?: MessageMetadataMedia
  location?: MessageMetadataLocation
  interactive?: MessageMetadataInteractive
  errors?: MessageMetadataError[]
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

/** Cloud API send-time template component (header/body parameters). */
export type MetaSendTemplateParameter = {
  type: 'text'
  text: string
  parameter_name?: string
}

export type MetaSendTemplateComponent = {
  type: 'header' | 'body'
  parameters: MetaSendTemplateParameter[]
}

/**
 * Normalized named-variable contract stored on message_templates.parameterSchema.
 * V1: body + text-header names only; sendable=false when unsupported.
 */
export type TemplateParameterSchema = {
  headerNames: string[]
  bodyNames: string[]
  sendable: boolean
  unsupportedReason?: string
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
