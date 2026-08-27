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
  'text' | 'image' | 'document' | 'audio' | 'location' | 'interactive' | string

export type MetaWebhookContext = {
  id?: string
  from?: string
}

export type MetaWebhookReferral = {
  source_url?: string
  source_type?: string
  source_id?: string
  headline?: string
  body?: string
  ctwa_clid?: string
}

export type MetaWebhookMessage = {
  from: string
  id: string
  timestamp: string
  type: MetaWebhookMessageType
  text?: MetaWebhookText
  image?: MetaWebhookMedia
  document?: MetaWebhookMedia
  location?: MetaWebhookLocation
  interactive?: MetaWebhookInteractive
  context?: MetaWebhookContext
  referral?: MetaWebhookReferral
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

export type MessageMetadataContext = {
  id?: string
  from?: string
}

export type MessageMetadataReferral = {
  sourceUrl?: string
  sourceType?: string
  sourceId?: string
  headline?: string
  body?: string
  ctwaClid?: string
}

export type MessageMetadata = {
  media?: MessageMetadataMedia
  location?: MessageMetadataLocation
  interactive?: MessageMetadataInteractive
  errors?: MessageMetadataError[]
  context?: MessageMetadataContext
  referral?: MessageMetadataReferral
  [key: string]: unknown
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
export type MetaSendTemplateTextParameter = {
  type: 'text'
  text: string
  parameter_name?: string
}

export type MetaSendTemplateImageParameter = {
  type: 'image'
  image: { link: string }
}

export type MetaSendTemplateDocumentParameter = {
  type: 'document'
  document: { link: string; filename?: string }
}

export type MetaSendTemplateParameter =
  MetaSendTemplateTextParameter | MetaSendTemplateImageParameter | MetaSendTemplateDocumentParameter

export type MetaSendTemplateHeaderOrBodyComponent = {
  type: 'header' | 'body'
  parameters: MetaSendTemplateParameter[]
}

export type MetaSendTemplateUrlButtonComponent = {
  type: 'button'
  sub_type: 'url'
  index: string
  parameters: MetaSendTemplateTextParameter[]
}

export type MetaSendTemplateComponent =
  MetaSendTemplateHeaderOrBodyComponent | MetaSendTemplateUrlButtonComponent

/** Tenant-sendable header media is image-only; document is reserved for integrations. */
export type TemplateHeaderMediaType = 'image' | 'document'

export type TemplateUrlButtonParam = {
  name: string
  index: number
}

/**
 * Normalized template-variable contract stored on message_templates.parameterSchema.
 * Media headers set headerMediaType and leave headerNames empty.
 * URL-button vars live in urlButtons (Meta index + parameter name / positional key).
 * parameterFormat is 'positional' for {{1}}/{{2}} and 'named' for {{name}}.
 */
export type TemplateParameterFormat = 'named' | 'positional'

export type TemplateParameterSchema = {
  headerNames: string[]
  bodyNames: string[]
  urlButtons?: TemplateUrlButtonParam[]
  sendable: boolean
  unsupportedReason?: string
  headerMediaType?: TemplateHeaderMediaType
  /** Present when sendable and the template has (or had) text placeholders. */
  parameterFormat?: TemplateParameterFormat
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
  format?: 'TEXT' | 'IMAGE' | 'DOCUMENT' | string
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
