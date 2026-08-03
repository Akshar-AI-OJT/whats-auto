import type {
  MessageMetadata,
  MessageMetadataError,
  MessageMetadataInteractive,
  MessageMetadataLocation,
  MessageMetadataMedia,
  MetaWebhookContact,
  MetaWebhookError,
  MetaWebhookInteractive,
  MetaWebhookLocation,
  MetaWebhookMedia,
  MetaWebhookMessage,
  MetaWebhookStatus,
  MetaWebhookStatusName,
} from '#lib/meta_whatsapp/types'

export type ParsedWebhookSkipReason =
  'unsupported_field' | 'malformed_value' | 'missing_phone_number_id'

export type ParsedInboundMessage = {
  providerMessageId: string
  fromWaId: string
  occurredAt: Date
  contentType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'interactive'
  contentText: string | null
  metadata: MessageMetadata
  profileName: string | null
}

export type ParsedDeliveryReceipt = {
  providerMessageId: string
  status: MetaWebhookStatusName
  providerStatusAt: Date
  recipientWaId: string | null
  errorMessage: string | null
  metadataErrors: MessageMetadataError[]
}

export type ParsedWebhookValue =
  | {
      kind: 'skip'
      reason: ParsedWebhookSkipReason
      field: string | null
    }
  | {
      kind: 'inbox'
      phoneNumberId: string
      displayPhoneNumber: string | null
      messages: ParsedInboundMessage[]
      statuses: ParsedDeliveryReceipt[]
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseUnixTimestamp(raw: unknown): Date | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return null
  }
  const seconds = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null
  }
  return new Date(seconds * 1000)
}

function parseMedia(raw: unknown): MetaWebhookMedia | undefined {
  if (!isRecord(raw)) return undefined
  return {
    id: asOptionalString(raw.id),
    mime_type: asOptionalString(raw.mime_type),
    caption: asOptionalString(raw.caption),
    filename: asOptionalString(raw.filename),
    sha256: asOptionalString(raw.sha256),
  }
}

function parseLocation(raw: unknown): MetaWebhookLocation | undefined {
  if (!isRecord(raw)) return undefined
  return {
    latitude: asOptionalNumber(raw.latitude),
    longitude: asOptionalNumber(raw.longitude),
    name: asOptionalString(raw.name),
    address: asOptionalString(raw.address),
    url: asOptionalString(raw.url),
  }
}

function parseInteractive(raw: unknown): MetaWebhookInteractive | undefined {
  if (!isRecord(raw)) return undefined
  const button = isRecord(raw.button_reply) ? raw.button_reply : undefined
  const list = isRecord(raw.list_reply) ? raw.list_reply : undefined
  return {
    type: asOptionalString(raw.type),
    button_reply: button
      ? {
          id: asOptionalString(button.id),
          title: asOptionalString(button.title),
        }
      : undefined,
    list_reply: list
      ? {
          id: asOptionalString(list.id),
          title: asOptionalString(list.title),
          description: asOptionalString(list.description),
        }
      : undefined,
  }
}

function parseErrors(raw: unknown): MetaWebhookError[] {
  if (!Array.isArray(raw)) return []
  const errors: MetaWebhookError[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const errorData = isRecord(item.error_data) ? item.error_data : undefined
    errors.push({
      code: asOptionalNumber(item.code),
      title: asOptionalString(item.title),
      message: asOptionalString(item.message),
      error_data: errorData ? { details: asOptionalString(errorData.details) } : undefined,
    })
  }
  return errors
}

function toMetadataErrors(errors: MetaWebhookError[]): MessageMetadataError[] {
  return errors.map((error) => ({
    code: error.code,
    title: error.title,
    message: error.message,
    details: error.error_data?.details,
  }))
}

function toMetadataMedia(media: MetaWebhookMedia | undefined): MessageMetadataMedia | undefined {
  if (!media) return undefined
  const mapped: MessageMetadataMedia = {
    id: media.id,
    mimeType: media.mime_type,
    caption: media.caption,
    filename: media.filename,
    sha256: media.sha256,
  }
  if (!mapped.id && !mapped.mimeType && !mapped.caption && !mapped.filename && !mapped.sha256) {
    return undefined
  }
  return mapped
}

function toMetadataLocation(
  location: MetaWebhookLocation | undefined
): MessageMetadataLocation | undefined {
  if (!location) return undefined
  if (
    location.latitude === undefined &&
    location.longitude === undefined &&
    !location.name &&
    !location.address &&
    !location.url
  ) {
    return undefined
  }
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    name: location.name,
    address: location.address,
    url: location.url,
  }
}

function toMetadataInteractive(
  interactive: MetaWebhookInteractive | undefined
): MessageMetadataInteractive | undefined {
  if (!interactive) return undefined
  const mapped: MessageMetadataInteractive = {
    type: interactive.type,
    buttonReply: interactive.button_reply
      ? { id: interactive.button_reply.id, title: interactive.button_reply.title }
      : undefined,
    listReply: interactive.list_reply
      ? {
          id: interactive.list_reply.id,
          title: interactive.list_reply.title,
          description: interactive.list_reply.description,
        }
      : undefined,
  }
  if (!mapped.type && !mapped.buttonReply && !mapped.listReply) {
    return undefined
  }
  return mapped
}

function formatErrorMessage(errors: MetaWebhookError[]): string | null {
  if (errors.length === 0) return null
  const parts = errors.map((error) => {
    const code = error.code !== undefined ? `[${error.code}] ` : ''
    const title = error.title ?? error.message ?? 'WhatsApp delivery failed'
    const details = error.error_data?.details ? `: ${error.error_data.details}` : ''
    return `${code}${title}${details}`
  })
  return parts.join('; ')
}

function profileNameForWaId(contacts: MetaWebhookContact[], waId: string): string | null {
  const match = contacts.find((contact) => contact.wa_id === waId)
  return match?.profile?.name?.trim() || null
}

function parseContact(raw: unknown): MetaWebhookContact | null {
  if (!isRecord(raw)) return null
  const waId = asOptionalString(raw.wa_id)
  if (!waId) return null
  const profile = isRecord(raw.profile) ? raw.profile : undefined
  return {
    wa_id: waId,
    profile: profile ? { name: asOptionalString(profile.name) } : undefined,
  }
}

function parseMessage(raw: unknown): MetaWebhookMessage | null {
  if (!isRecord(raw)) return null
  const id = asOptionalString(raw.id)
  const from = asOptionalString(raw.from)
  const type = asOptionalString(raw.type)
  const timestamp = raw.timestamp
  if (!id || !from || !type) return null
  if (parseUnixTimestamp(timestamp) === null) return null

  const text = isRecord(raw.text) ? { body: asOptionalString(raw.text.body) } : undefined

  return {
    from,
    id,
    timestamp: String(timestamp),
    type,
    text,
    image: parseMedia(raw.image),
    audio: parseMedia(raw.audio),
    video: parseMedia(raw.video),
    document: parseMedia(raw.document),
    location: parseLocation(raw.location),
    interactive: parseInteractive(raw.interactive),
    errors: parseErrors(raw.errors),
  }
}

function parseStatus(raw: unknown): MetaWebhookStatus | null {
  if (!isRecord(raw)) return null
  const id = asOptionalString(raw.id)
  const statusRaw = asOptionalString(raw.status)
  if (!id || !statusRaw) return null
  if (
    statusRaw !== 'sent' &&
    statusRaw !== 'delivered' &&
    statusRaw !== 'read' &&
    statusRaw !== 'failed'
  ) {
    return null
  }
  if (parseUnixTimestamp(raw.timestamp) === null) return null

  return {
    id,
    status: statusRaw,
    timestamp: String(raw.timestamp),
    recipient_id: asOptionalString(raw.recipient_id),
    errors: parseErrors(raw.errors),
  }
}

function toInboundMessage(
  message: MetaWebhookMessage,
  contacts: MetaWebhookContact[]
): ParsedInboundMessage | null {
  const occurredAt = parseUnixTimestamp(message.timestamp)
  if (!occurredAt) return null

  const supportedTypes = new Set([
    'text',
    'image',
    'audio',
    'video',
    'document',
    'location',
    'interactive',
  ])
  if (!supportedTypes.has(message.type)) {
    return null
  }

  const contentType = message.type as ParsedInboundMessage['contentType']
  const metadata: MessageMetadata = {}
  let contentText: string | null = null

  switch (contentType) {
    case 'text':
      contentText = message.text?.body?.trim() || null
      break
    case 'image':
    case 'audio':
    case 'video':
    case 'document': {
      const media =
        contentType === 'image'
          ? message.image
          : contentType === 'audio'
            ? message.audio
            : contentType === 'video'
              ? message.video
              : message.document
      const mapped = toMetadataMedia(media)
      if (mapped) metadata.media = mapped
      contentText = mapped?.caption?.trim() || mapped?.filename?.trim() || null
      break
    }
    case 'location': {
      const mapped = toMetadataLocation(message.location)
      if (mapped) metadata.location = mapped
      contentText = mapped?.name?.trim() || mapped?.address?.trim() || null
      break
    }
    case 'interactive': {
      const mapped = toMetadataInteractive(message.interactive)
      if (mapped) metadata.interactive = mapped
      contentText = mapped?.buttonReply?.title?.trim() || mapped?.listReply?.title?.trim() || null
      break
    }
  }

  const metadataErrors = toMetadataErrors(message.errors ?? [])
  if (metadataErrors.length > 0) {
    metadata.errors = metadataErrors
  }

  return {
    providerMessageId: message.id,
    fromWaId: message.from,
    occurredAt,
    contentType,
    contentText,
    metadata,
    profileName: profileNameForWaId(contacts, message.from),
  }
}

function toDeliveryReceipt(status: MetaWebhookStatus): ParsedDeliveryReceipt | null {
  const providerStatusAt = parseUnixTimestamp(status.timestamp)
  if (!providerStatusAt) return null

  const metadataErrors = toMetadataErrors(status.errors ?? [])

  return {
    providerMessageId: status.id,
    status: status.status,
    providerStatusAt,
    recipientWaId: status.recipient_id ?? null,
    errorMessage: status.status === 'failed' ? formatErrorMessage(status.errors ?? []) : null,
    metadataErrors,
  }
}

/**
 * Runtime-narrow a single Meta change into inbox work or a structured skip.
 * Persistence must never see untyped Meta JSON after this seam.
 */
export function parseWebhookChange(params: {
  field: string | undefined
  value: unknown
}): ParsedWebhookValue {
  const field = params.field ?? null

  if (field !== null && field !== 'messages') {
    return { kind: 'skip', reason: 'unsupported_field', field }
  }

  if (!isRecord(params.value)) {
    return { kind: 'skip', reason: 'malformed_value', field }
  }

  const metadata = isRecord(params.value.metadata) ? params.value.metadata : undefined
  const phoneNumberId = asOptionalString(metadata?.phone_number_id)
  if (!phoneNumberId) {
    return { kind: 'skip', reason: 'missing_phone_number_id', field }
  }

  const contactsRaw = Array.isArray(params.value.contacts) ? params.value.contacts : []
  const contacts = contactsRaw
    .map(parseContact)
    .filter((contact): contact is MetaWebhookContact => contact !== null)

  const messagesRaw = Array.isArray(params.value.messages) ? params.value.messages : []
  const statusesRaw = Array.isArray(params.value.statuses) ? params.value.statuses : []

  const messages: ParsedInboundMessage[] = []
  for (const raw of messagesRaw) {
    const message = parseMessage(raw)
    if (!message) continue
    const inbound = toInboundMessage(message, contacts)
    if (inbound) messages.push(inbound)
  }

  const statuses: ParsedDeliveryReceipt[] = []
  for (const raw of statusesRaw) {
    const status = parseStatus(raw)
    if (!status) continue
    const receipt = toDeliveryReceipt(status)
    if (receipt) statuses.push(receipt)
  }

  // Empty but well-formed messages field (e.g. only unsupported types) still resolves tenant.
  return {
    kind: 'inbox',
    phoneNumberId,
    displayPhoneNumber: asOptionalString(metadata?.display_phone_number) ?? null,
    messages,
    statuses,
  }
}
