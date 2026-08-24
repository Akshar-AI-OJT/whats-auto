/**
 * Inbox SSE contract (GET /api/v1/inbox/events).
 *
 * Native EventSource cannot set Authorization. The client uses fetch() with the
 * same Bearer JWT as other tenant APIs, plus credentials for the session cookie.
 */

export const INBOX_SSE_MESSAGE_TYPES = [
  'message.received',
  'message.queued',
  'message.sent',
  'message.failed',
  'status.updated',
] as const

export const INBOX_SSE_AI_TYPES = ['ai.handover.triggered'] as const

export type InboxSseMessageType = (typeof INBOX_SSE_MESSAGE_TYPES)[number]
export type InboxSseAiType = (typeof INBOX_SSE_AI_TYPES)[number]
export type InboxSseClientEventType = InboxSseMessageType | InboxSseAiType

export type InboxSseMessageReceivedPayload = {
  organizationId: string
  conversationId: string
  messageId: string
  whatsappConfigId: string
  contactId: string
  contentType: string
  contentText: string | null
  direction: 'inbound'
  providerMessageId: string
  status: string
  occurredAt: string
  createdAt: string
}

/**
 * Outbound lifecycle. Snapshot fields are optional for backward compatibility
 * with skinny payloads; when present the FE can append without refetch.
 */
export type InboxSseMessageLifecyclePayload = {
  organizationId: string
  conversationId: string
  messageId: string
  dispatchId: string
  providerMessageId?: string | null
  direction?: 'outbound'
  senderType?: string
  senderId?: string | null
  contentType?: string
  contentText?: string | null
  previewText?: string | null
  mediaUrl?: string | null
  mediaAssetId?: string | null
  status?: string
  createdAt?: string
  errorMessage?: string | null
}

export type InboxSseStatusUpdatedPayload = {
  organizationId: string
  conversationId: string
  messageId: string
  providerMessageId: string
  previousStatus: string
  status: string
  providerStatusAt: string
}

export type InboxSseAiHandoverPayload = {
  conversationId: string
  reason: 'low_confidence' | 'keyword_match' | 'business_exception' | string
  score?: number
  matchedKeyword?: string
}

export type InboxSseClientEvent =
  | { type: 'message.received'; organizationId: string; payload: InboxSseMessageReceivedPayload }
  | { type: 'message.queued'; organizationId: string; payload: InboxSseMessageLifecyclePayload }
  | { type: 'message.sent'; organizationId: string; payload: InboxSseMessageLifecyclePayload }
  | { type: 'message.failed'; organizationId: string; payload: InboxSseMessageLifecyclePayload }
  | { type: 'status.updated'; organizationId: string; payload: InboxSseStatusUpdatedPayload }
  | { type: 'ai.handover.triggered'; organizationId: string; payload: InboxSseAiHandoverPayload }

const CLIENT_EVENT_TYPE_SET = new Set<string>([...INBOX_SSE_MESSAGE_TYPES, ...INBOX_SSE_AI_TYPES])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value === 'string') return value
  return undefined
}

function isClientEventType(value: string): value is InboxSseClientEventType {
  return CLIENT_EVENT_TYPE_SET.has(value)
}

function parseReceivedPayload(payload: Record<string, unknown>): InboxSseMessageReceivedPayload | null {
  const organizationId = asString(payload.organizationId)
  const conversationId = asString(payload.conversationId)
  const messageId = asString(payload.messageId)
  const whatsappConfigId = asString(payload.whatsappConfigId)
  const contactId = asString(payload.contactId)
  const contentType = asString(payload.contentType)
  const direction = payload.direction
  const providerMessageId = asString(payload.providerMessageId)
  const status = asString(payload.status)
  const occurredAt = asString(payload.occurredAt)
  const createdAt = asString(payload.createdAt)

  if (
    !organizationId ||
    !conversationId ||
    !messageId ||
    !whatsappConfigId ||
    !contactId ||
    !contentType ||
    direction !== 'inbound' ||
    !providerMessageId ||
    !status ||
    !occurredAt ||
    !createdAt
  ) {
    return null
  }

  return {
    organizationId,
    conversationId,
    messageId,
    whatsappConfigId,
    contactId,
    contentType,
    contentText: typeof payload.contentText === 'string' ? payload.contentText : null,
    direction: 'inbound',
    providerMessageId,
    status,
    occurredAt,
    createdAt,
  }
}

function parseLifecyclePayload(payload: Record<string, unknown>): InboxSseMessageLifecyclePayload | null {
  const organizationId = asString(payload.organizationId)
  const conversationId = asString(payload.conversationId)
  const messageId = asString(payload.messageId)
  const dispatchId = asString(payload.dispatchId)
  if (!organizationId || !conversationId || !messageId || !dispatchId) return null

  const direction = payload.direction === 'outbound' ? 'outbound' : undefined

  return {
    organizationId,
    conversationId,
    messageId,
    dispatchId,
    providerMessageId:
      typeof payload.providerMessageId === 'string' ? payload.providerMessageId : null,
    direction,
    senderType: asString(payload.senderType) ?? undefined,
    senderId: asNullableString(payload.senderId),
    contentType: asString(payload.contentType) ?? undefined,
    contentText: asNullableString(payload.contentText),
    previewText: asNullableString(payload.previewText),
    mediaUrl: asNullableString(payload.mediaUrl),
    mediaAssetId: asNullableString(payload.mediaAssetId),
    status: asString(payload.status) ?? undefined,
    createdAt: asString(payload.createdAt) ?? undefined,
    errorMessage: asNullableString(payload.errorMessage),
  }
}

function parseHandoverPayload(payload: Record<string, unknown>): InboxSseAiHandoverPayload | null {
  const conversationId = asString(payload.conversationId)
  const reason = asString(payload.reason)
  if (!conversationId || !reason) return null

  return {
    conversationId,
    reason,
    score: typeof payload.score === 'number' ? payload.score : undefined,
    matchedKeyword: typeof payload.matchedKeyword === 'string' ? payload.matchedKeyword : undefined,
  }
}

function parseStatusPayload(payload: Record<string, unknown>): InboxSseStatusUpdatedPayload | null {
  const organizationId = asString(payload.organizationId)
  const conversationId = asString(payload.conversationId)
  const messageId = asString(payload.messageId)
  const providerMessageId = asString(payload.providerMessageId)
  const previousStatus = asString(payload.previousStatus)
  const status = asString(payload.status)
  const providerStatusAt = asString(payload.providerStatusAt)
  if (
    !organizationId ||
    !conversationId ||
    !messageId ||
    !providerMessageId ||
    !previousStatus ||
    !status ||
    !providerStatusAt
  ) {
    return null
  }

  return {
    organizationId,
    conversationId,
    messageId,
    providerMessageId,
    previousStatus,
    status,
    providerStatusAt,
  }
}

export function parseInboxSseClientEvent(raw: unknown): InboxSseClientEvent | null {
  if (!isRecord(raw)) return null
  const type = asString(raw.type)
  const organizationId = asString(raw.organizationId)
  if (!type || !isClientEventType(type) || !organizationId) return null
  if (!isRecord(raw.payload)) return null

  if (type === 'message.received') {
    const payload = parseReceivedPayload(raw.payload)
    return payload ? { type, organizationId, payload } : null
  }

  if (type === 'status.updated') {
    const payload = parseStatusPayload(raw.payload)
    return payload ? { type, organizationId, payload } : null
  }

  if (type === 'ai.handover.triggered') {
    const payload = parseHandoverPayload(raw.payload)
    return payload ? { type, organizationId, payload } : null
  }

  const payload = parseLifecyclePayload(raw.payload)
  return payload ? { type, organizationId, payload } : null
}

/** True when lifecycle payload includes enough fields to append a thread bubble. */
export function hasLifecycleMessageSnapshot(payload: InboxSseMessageLifecyclePayload): boolean {
  return Boolean(payload.contentType && payload.createdAt && payload.senderType)
}

/** Parse one SSE block (`event:` / `data:` lines separated by a blank line). */
export function parseSseBlock(block: string): InboxSseClientEvent | null {
  const lines = block.replace(/\r/g, '').split('\n')
  const dataLines: string[] = []
  let eventName: string | null = null

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  if (eventName === 'ping') return null
  if (eventName?.startsWith('ai.') && eventName !== 'ai.handover.triggered') return null
  if (dataLines.length === 0) return null

  try {
    const parsed: unknown = JSON.parse(dataLines.join('\n'))
    const event = parseInboxSseClientEvent(parsed)
    if (!event) return null
    if (eventName && eventName !== event.type) return null
    return event
  } catch {
    return null
  }
}
