import db from '@adonisjs/lucid/services/db'
import ConversationException from '#exceptions/conversation_exception'
import WhatsappOutboundService, {
  type QueueOutboundResult,
} from '#services/whatsapp_outbound_service'

export type MessageContentType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'template'
export type MediaContentType = 'image' | 'video' | 'audio' | 'document'

export type MessageSender = {
  type: string
  id: string | null
  name: string | null
}

export type MessageMedia = {
  id: string
  fileName: string
  mimeType: string
  fileSize: number
  filePath: string
  url: string | null
} | null

export type MessageRecord = {
  id: string
  organizationId: string
  conversationId: string
  senderType: string
  senderId: string | null
  direction: 'inbound' | 'outbound'
  contentType: string
  contentText: string | null
  mediaUrl: string | null
  mediaAssetId: string | null
  status: string
  providerMessageId: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string | null
  sender: MessageSender
  media: MessageMedia
}

export type SendAgentReplyParams = {
  organizationId: string
  conversationId: string
  senderId: string
  contentType: MessageContentType
  contentText?: string
  mediaAssetId?: string
  templateId?: string
  templateParameters?: Record<string, string>
  idempotencyKey: string
}

function toIso(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function directionFromSenderType(senderType: string): 'inbound' | 'outbound' {
  return senderType === 'contact' ? 'inbound' : 'outbound'
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function mapMedia(r: Record<string, unknown>): MessageMedia {
  if (!r.mediaAssetId || !r.mediaFileName) return null

  const filePath = r.mediaFilePath as string
  const mediaUrl = (r.mediaUrl as string | null) ?? null

  return {
    id: r.mediaAssetId as string,
    fileName: r.mediaFileName as string,
    mimeType: r.mediaMimeType as string,
    fileSize: Number(r.mediaFileSize ?? 0),
    filePath,
    url: mediaUrl ?? (isPublicHttpUrl(filePath) ? filePath : null),
  }
}

function mapMessageRow(r: Record<string, unknown>): MessageRecord {
  const senderType = r.senderType as string
  return {
    id: r.id as string,
    organizationId: r.organizationId as string,
    conversationId: r.conversationId as string,
    senderType,
    senderId: (r.senderId as string | null) ?? null,
    direction: directionFromSenderType(senderType),
    contentType: r.contentType as string,
    contentText: (r.contentText as string | null) ?? null,
    mediaUrl: (r.mediaUrl as string | null) ?? null,
    mediaAssetId: (r.mediaAssetId as string | null) ?? null,
    status: r.status as string,
    providerMessageId: (r.providerMessageId as string | null) ?? null,
    errorMessage: (r.errorMessage as string | null) ?? null,
    createdAt: toIso(r.createdAt) as string,
    updatedAt: toIso(r.updatedAt),
    sender: {
      type: senderType,
      id: (r.senderId as string | null) ?? null,
      name: (r.senderName as string | null) ?? null,
    },
    media: mapMedia(r),
  }
}

export class MessageService {
  constructor(
    protected whatsappOutbound: WhatsappOutboundService = new WhatsappOutboundService()
  ) {}

  /**
   * Paginated message thread for a conversation, chronological (createdAt ASC).
   */
  async listMessagesPaginated(params: {
    organizationId: string
    conversationId: string
    page?: number
    limit?: number
  }) {
    await this.findConversationOrFail(params)

    const page = params.page ?? 1
    const limit = params.limit ?? 20

    const base = db
      .from('messages as m')
      .where('m.organizationId', params.organizationId)
      .where('m.conversationId', params.conversationId)

    const countResult = await base.clone().count('* as total').first()
    const total = Number(countResult?.total ?? 0)

    const rows = await base
      .clone()
      .leftJoin('users as u', 'u.id', 'm.senderId')
      .leftJoin('media_assets as ma', 'ma.id', 'm.mediaAssetId')
      .select(
        'm.id',
        'm.organizationId',
        'm.conversationId',
        'm.senderType',
        'm.senderId',
        'm.contentType',
        'm.contentText',
        'm.mediaUrl',
        'm.mediaAssetId',
        'm.status',
        'm.providerMessageId',
        'm.errorMessage',
        'm.createdAt',
        'm.updatedAt',
        'u.name as senderName',
        'ma.fileName as mediaFileName',
        'ma.mimeType as mediaMimeType',
        'ma.fileSize as mediaFileSize',
        'ma.filePath as mediaFilePath'
      )
      .orderBy('m.createdAt', 'asc')
      .offset((page - 1) * limit)
      .limit(limit)

    const lastPage = Math.ceil(total / limit) || 1

    return {
      data: rows.map((r) => mapMessageRow(r)),
      meta: {
        total,
        perPage: limit,
        currentPage: page,
        lastPage,
      },
    }
  }

  /**
   * Queue an outbound agent reply via WhatsappOutboundService (async Meta delivery).
   * Session window, closed-conversation, and media/template rules live in the outbound service.
   */
  async sendAgentReply(params: SendAgentReplyParams): Promise<MessageRecord> {
    const { organizationId, conversationId, senderId, contentType } = params
    const queued = await this.queueOutboundByContentType(params)

    return this.hydrateMessage({
      id: queued.messageId,
      organizationId,
      conversationId,
      senderId,
      contentType,
    })
  }

  private async queueOutboundByContentType(
    params: SendAgentReplyParams
  ): Promise<QueueOutboundResult> {
    const { organizationId, conversationId, senderId, contentType, idempotencyKey } = params

    switch (contentType) {
      case 'text': {
        const queueParams = {
          organizationId,
          conversationId,
          text: params.contentText ?? '',
          actorUserId: senderId,
          idempotencyKey,
        }
        return this.whatsappOutbound.queueText(queueParams)
      }
      case 'image':
      case 'video':
      case 'audio':
      case 'document': {
        const queueParams = {
          organizationId,
          conversationId,
          mediaType: contentType,
          mediaAssetId: params.mediaAssetId!,
          caption: params.contentText,
          actorUserId: senderId,
          idempotencyKey,
        }
        return this.whatsappOutbound.queueMedia(queueParams)
      }
      case 'template': {
        const queueParams = {
          organizationId,
          conversationId,
          templateId: params.templateId!,
          parameters: params.templateParameters,
          actorUserId: senderId,
          idempotencyKey,
        }
        return this.whatsappOutbound.queueTemplate(queueParams)
      }
    }
  }

  private async hydrateMessage(row: Record<string, unknown>): Promise<MessageRecord> {
    const enriched = await db
      .from('messages as m')
      .leftJoin('users as u', 'u.id', 'm.senderId')
      .leftJoin('media_assets as ma', 'ma.id', 'm.mediaAssetId')
      .where('m.id', row.id as string)
      .where('m.organizationId', row.organizationId as string)
      .select(
        'm.id',
        'm.organizationId',
        'm.conversationId',
        'm.senderType',
        'm.senderId',
        'm.contentType',
        'm.contentText',
        'm.mediaUrl',
        'm.mediaAssetId',
        'm.status',
        'm.providerMessageId',
        'm.errorMessage',
        'm.createdAt',
        'm.updatedAt',
        'u.name as senderName',
        'ma.fileName as mediaFileName',
        'ma.mimeType as mediaMimeType',
        'ma.fileSize as mediaFileSize',
        'ma.filePath as mediaFilePath'
      )
      .first()

    return mapMessageRow(enriched ?? row)
  }

  private async findConversationOrFail(params: {
    organizationId: string
    conversationId: string
  }) {
    const row = await db
      .from('conversations')
      .where('id', params.conversationId)
      .where('organizationId', params.organizationId)
      .select('id')
      .first()

    if (!row) {
      throw ConversationException.notFound()
    }

    return row
  }
}
