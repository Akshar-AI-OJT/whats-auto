import db from '@adonisjs/lucid/services/db'
import { Exception } from '@adonisjs/core/exceptions'
import ConversationException from '#exceptions/conversation_exception'
import MessageException from '#exceptions/message_exception'
import { createMetaGraphClient, MetaGraphApiError, type MetaGraphClient } from '#lib/meta_whatsapp/graph_client'
import { WhatsappConfigService } from '#services/whatsapp_config_service'

export type MessageContentType = 'text' | 'image' | 'video' | 'audio' | 'document'
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

const MESSAGE_COLUMNS = [
  'id',
  'organizationId',
  'conversationId',
  'senderType',
  'senderId',
  'contentType',
  'contentText',
  'mediaUrl',
  'mediaAssetId',
  'status',
  'providerMessageId',
  'errorMessage',
  'createdAt',
  'updatedAt',
] as const

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
    protected graphClient: MetaGraphClient = createMetaGraphClient(),
    protected whatsappConfigService: WhatsappConfigService = new WhatsappConfigService()
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
   * Create an outbound agent reply and dispatch via Meta Cloud API.
   */
  async sendAgentReply(params: {
    organizationId: string
    conversationId: string
    senderId: string
    contentType: MessageContentType
    contentText?: string
    mediaAssetId?: string
  }): Promise<MessageRecord> {
    const { organizationId, conversationId, senderId, contentType } = params
    const contentText = params.contentText?.trim() || null

    const conversation = await this.findConversationForReplyOrFail({
      organizationId,
      conversationId,
    })

    if (conversation.status === 'closed') {
      throw MessageException.conversationClosed()
    }

    let mediaAsset: {
      id: string
      fileName: string
      mimeType: string
      fileSize: number
      filePath: string
    } | null = null
    let mediaUrl: string | null = null

    if (contentType !== 'text') {
      mediaAsset = await this.findMediaAssetOrFail({
        organizationId,
        mediaAssetId: params.mediaAssetId!,
      })
      mediaUrl = isPublicHttpUrl(mediaAsset.filePath) ? mediaAsset.filePath : null
      if (!mediaUrl) {
        throw MessageException.mediaLinkUnavailable()
      }
    }

    const [inserted] = await db
      .table('messages')
      .insert({
        organizationId,
        conversationId,
        senderType: 'agent',
        senderId,
        contentType,
        contentText,
        mediaUrl,
        mediaAssetId: mediaAsset?.id ?? null,
        status: 'queued',
      })
      .returning([...MESSAGE_COLUMNS])

    const previewText =
      contentType === 'text'
        ? contentText
        : contentText || `[${contentType}] ${mediaAsset?.fileName ?? ''}`.trim()

    try {
      const { config, accessToken } = await this.whatsappConfigService.getDecryptedAccessToken(
        conversation.whatsappConfigId
      )

      if (config.status !== 'connected') {
        throw MessageException.whatsappNotConnected()
      }

      const to = conversation.contactPhoneNormalized as string

      const sendResult =
        contentType === 'text'
          ? await this.graphClient.sendTextMessage({
              phoneNumberId: config.phoneNumberId,
              accessToken,
              to,
              text: contentText!,
            })
          : await this.graphClient.sendMediaMessage({
              phoneNumberId: config.phoneNumberId,
              accessToken,
              to,
              type: contentType as MediaContentType,
              link: mediaUrl!,
              caption: contentText ?? undefined,
              filename: mediaAsset?.fileName,
            })

      const [updated] = await db
        .from('messages')
        .where('id', inserted.id)
        .where('organizationId', organizationId)
        .update({
          status: 'sent',
          providerMessageId: sendResult.messageId ?? null,
          updatedAt: new Date(),
        })
        .returning([...MESSAGE_COLUMNS])

      await this.touchConversationAfterOutbound({
        organizationId,
        conversationId,
        lastMessageText: previewText,
        firstResponseAt: conversation.firstResponseAt,
      })

      return this.hydrateMessage(updated)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send message'

      await db
        .from('messages')
        .where('id', inserted.id)
        .where('organizationId', organizationId)
        .update({
          status: 'failed',
          errorMessage,
          updatedAt: new Date(),
        })

      if (error instanceof MessageException) {
        throw error
      }

      if (error instanceof Exception && error.status < 500) {
        throw error
      }

      if (error instanceof MetaGraphApiError) {
        throw MessageException.metaGraphFailed(error.message)
      }

      throw MessageException.metaGraphFailed(errorMessage)
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

  private async touchConversationAfterOutbound(params: {
    organizationId: string
    conversationId: string
    lastMessageText: string | null
    firstResponseAt: unknown
  }) {
    const patch: Record<string, unknown> = {
      lastMessageText: params.lastMessageText,
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    }

    if (!params.firstResponseAt) {
      patch.firstResponseAt = new Date()
    }

    await db
      .from('conversations')
      .where('id', params.conversationId)
      .where('organizationId', params.organizationId)
      .update(patch)
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

  private async findConversationForReplyOrFail(params: {
    organizationId: string
    conversationId: string
  }) {
    const row = await db
      .from('conversations as c')
      .innerJoin('contacts as ct', 'ct.id', 'c.contactId')
      .where('c.id', params.conversationId)
      .where('c.organizationId', params.organizationId)
      .whereNull('ct.deletedAt')
      .select(
        'c.id',
        'c.status',
        'c.whatsappConfigId',
        'c.firstResponseAt',
        'ct.phoneNormalized as contactPhoneNormalized'
      )
      .first()

    if (!row) {
      throw ConversationException.notFound()
    }

    return row
  }

  private async findMediaAssetOrFail(params: {
    organizationId: string
    mediaAssetId: string
  }) {
    const row = await db
      .from('media_assets')
      .where('id', params.mediaAssetId)
      .where('organizationId', params.organizationId)
      .select('id', 'fileName', 'mimeType', 'fileSize', 'filePath')
      .first()

    if (!row) {
      throw MessageException.mediaNotFound()
    }

    return {
      id: row.id as string,
      fileName: row.fileName as string,
      mimeType: row.mimeType as string,
      fileSize: Number(row.fileSize ?? 0),
      filePath: row.filePath as string,
    }
  }
}
