import logger from '@adonisjs/core/services/logger'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import env from '#start/env'
import InboxMessageFailed from '#events/inbox_message_failed'
import InboxMessageQueued from '#events/inbox_message_queued'
import InboxMessageSent from '#events/inbox_message_sent'
import InboxStatusUpdated from '#events/inbox_status_updated'
import WhatsappOutboundException from '#exceptions/whatsapp_outbound_exception'
import {
  MetaGraphApiError,
  createMetaGraphClient,
  type MetaGraphClient,
} from '#lib/meta_whatsapp/graph_client'
import {
  isApprovedOutboundMediaUrl,
  isMimeTypeAllowedForMediaType,
  isOutboundMediaSizeAllowed,
  OUTBOUND_MEDIA_MAX_BYTES,
  parseOutboundMediaAllowedHosts,
  type OutboundMediaType,
} from '#lib/meta_whatsapp/outbound_media'
import {
  isRetryableOutboundError,
  isTerminalOutboundFailure,
  nextAttemptAt,
} from '#lib/meta_whatsapp/outbound_retry'
import {
  mapNamedParametersToMetaComponents,
  parseParameterSchema,
  TemplateParameterError,
} from '#lib/meta_whatsapp/template_parameters'
import {
  WhatsappOutboundRepository,
  type OutboundDispatchPayload,
  type OutboundDispatchRow,
} from '#repositories/whatsapp_outbound_repository'
import JobQueueManager from '#services/job_queue/job_queue_manager'
import { JOB_NAMES } from '#services/job_queue/job_names'
import { runWithTenant } from '#services/tenant_context'
import { WhatsappConfigService } from '#services/whatsapp_config_service'

export type QueueOutboundResult = {
  messageId: string
  dispatchId: string
}

export type RecoverStuckDispatchesResult = {
  woken: number
  scannedOrganizations: number
}

type ConversationContext = {
  conversationId: string
  whatsappConfigId: string
  to: string
  lastInboundMessageAt: Date | null
}

export type ExecuteDispatchResult =
  | {
      outcome: 'sent'
      dispatchId: string
      messageId: string
      providerMessageId: string
    }
  | { outcome: 'already_sent'; dispatchId: string }
  | { outcome: 'not_claimed'; dispatchId: string }
  | {
      outcome: 'retry_scheduled'
      dispatchId: string
      attempts: number
      nextAttemptAt: string
      errorMessage: string
    }
  | {
      outcome: 'failed'
      dispatchId: string
      attempts: number
      errorMessage: string
    }

/**
 * Tenant-safe outbound queue + Meta send executor (outbound.md).
 * queue* and executeDispatch both bind tenant RLS via runWithTenant.
 */
export default class WhatsappOutboundService {
  constructor(
    protected graphClient: MetaGraphClient = createMetaGraphClient(),
    protected outboundRepo: WhatsappOutboundRepository = new WhatsappOutboundRepository(),
    protected configService: WhatsappConfigService = new WhatsappConfigService()
  ) {}

  /**
   * Queue a free-form text send against an existing conversation.
   */
  async queueText(params: {
    organizationId: string
    conversationId: string
    text: string
    actorUserId?: string | null
    idempotencyKey?: string | null
  }): Promise<QueueOutboundResult> {
    const text = params.text.trim()
    if (!text) {
      throw WhatsappOutboundException.emptyText()
    }

    return runWithTenant(params.organizationId, async () => {
      const ctx = await this.#loadConversationContext(params.organizationId, params.conversationId)
      this.#assertSessionWindow(ctx.lastInboundMessageAt)

      const payload: OutboundDispatchPayload = {
        kind: 'text',
        to: ctx.to,
        text,
      }

      const queued = await db.transaction(async (trx) => {
        return this.#queueOutbound(trx, {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          whatsappConfigId: ctx.whatsappConfigId,
          actorUserId: params.actorUserId,
          contentType: 'text',
          contentText: text,
          messageTemplateId: null,
          payload,
          previewText: text,
          clientIdempotencyKey: params.idempotencyKey,
        })
      })

      await this.#emitInboxMessageQueued({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        messageId: queued.messageId,
        dispatchId: queued.dispatchId,
      })

      await this.#enqueueDispatchWake({
        organizationId: params.organizationId,
        dispatchId: queued.dispatchId,
      })

      return queued
    })
  }

  /**
   * Queue a free-form media send after validating the organization-owned public asset.
   */
  async queueMedia(params: {
    organizationId: string
    conversationId: string
    mediaType: OutboundMediaType
    mediaAssetId: string
    caption?: string | null
    actorUserId?: string | null
    idempotencyKey?: string | null
  }): Promise<QueueOutboundResult> {
    return runWithTenant(params.organizationId, async () => {
      const ctx = await this.#loadConversationContext(params.organizationId, params.conversationId)
      this.#assertSessionWindow(ctx.lastInboundMessageAt)

      const mediaAsset = await this.#loadMediaAsset({
        organizationId: params.organizationId,
        mediaAssetId: params.mediaAssetId,
      })
      this.#assertMediaAsset({ mediaType: params.mediaType, mediaAsset })

      const caption = params.caption?.trim() || undefined
      const payload: OutboundDispatchPayload = {
        kind: 'media',
        to: ctx.to,
        mediaType: params.mediaType,
        mediaAssetId: mediaAsset.id,
        mediaUrl: mediaAsset.filePath,
        caption,
        filename: mediaAsset.fileName,
      }
      const previewText = caption || `[${params.mediaType}] ${mediaAsset.fileName}`

      const queued = await db.transaction(async (trx) => {
        return this.#queueOutbound(trx, {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          whatsappConfigId: ctx.whatsappConfigId,
          actorUserId: params.actorUserId,
          contentType: params.mediaType,
          contentText: caption ?? null,
          messageTemplateId: null,
          payload,
          previewText,
          mediaAssetId: mediaAsset.id,
          mediaUrl: mediaAsset.filePath,
          clientIdempotencyKey: params.idempotencyKey,
        })
      })

      await this.#emitInboxMessageQueued({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        messageId: queued.messageId,
        dispatchId: queued.dispatchId,
      })

      await this.#enqueueDispatchWake({
        organizationId: params.organizationId,
        dispatchId: queued.dispatchId,
      })

      return queued
    })
  }

  /**
   * Queue an approved template send against an existing conversation.
   */
  async queueTemplate(params: {
    organizationId: string
    conversationId: string
    templateId: string
    parameters?: Record<string, string>
    actorUserId?: string | null
    idempotencyKey?: string | null
  }): Promise<QueueOutboundResult> {
    return runWithTenant(params.organizationId, async () => {
      const ctx = await this.#loadConversationContext(params.organizationId, params.conversationId)

      const template = await db
        .from('message_templates')
        .where('id', params.templateId)
        .where('organizationId', params.organizationId)
        .first()

      if (!template) {
        throw WhatsappOutboundException.templateNotFound()
      }

      if (String(template.status).toLowerCase() !== 'approved') {
        throw WhatsappOutboundException.templateNotApproved()
      }

      const schema = parseParameterSchema(
        typeof template.parameterSchema === 'string'
          ? JSON.parse(template.parameterSchema)
          : template.parameterSchema
      )

      if (!schema.sendable) {
        throw WhatsappOutboundException.templateNotSendable(
          schema.unsupportedReason ?? 'Template is not sendable'
        )
      }

      let components
      try {
        components = mapNamedParametersToMetaComponents({
          schema,
          values: params.parameters ?? {},
        })
      } catch (error) {
        if (error instanceof TemplateParameterError) {
          throw WhatsappOutboundException.invalidTemplateParameters(error.message)
        }
        throw error
      }

      const payload: OutboundDispatchPayload = {
        kind: 'template',
        to: ctx.to,
        templateId: template.id,
        templateName: template.name,
        languageCode: template.language ?? 'en_US',
        components,
      }

      const queued = await db.transaction(async (trx) => {
        return this.#queueOutbound(trx, {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          whatsappConfigId: ctx.whatsappConfigId,
          actorUserId: params.actorUserId,
          contentType: 'template',
          contentText: template.bodyText ?? null,
          messageTemplateId: template.id,
          payload,
          previewText: template.bodyText ?? template.name,
          clientIdempotencyKey: params.idempotencyKey,
        })
      })

      await this.#emitInboxMessageQueued({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        messageId: queued.messageId,
        dispatchId: queued.dispatchId,
      })

      await this.#enqueueDispatchWake({
        organizationId: params.organizationId,
        dispatchId: queued.dispatchId,
      })

      return queued
    })
  }

  /**
   * Claim → Meta send → persist success/failure.
   * Emits InboxMessageSent after markSentAndReconcile commits; InboxStatusUpdated only when
   * an early unmatched receipt actually updates the message after wamid save.
   * Event emission failures are logged and must not reverse a durable sent state.
   */
  async executeDispatch(params: {
    organizationId: string
    dispatchId: string
    lockOwner: string
  }): Promise<ExecuteDispatchResult> {
    return runWithTenant(params.organizationId, async () => {
      const claim = await db.transaction(async (trx) => {
        return this.outboundRepo.claimDispatch(trx, {
          organizationId: params.organizationId,
          dispatchId: params.dispatchId,
          lockOwner: params.lockOwner,
        })
      })

      if (claim.outcome === 'already_sent') {
        return { outcome: 'already_sent', dispatchId: params.dispatchId }
      }

      if (claim.outcome === 'not_claimed') {
        return { outcome: 'not_claimed', dispatchId: params.dispatchId }
      }

      const dispatch = claim.dispatch

      let providerMessageId: string
      let reconcile: Awaited<ReturnType<WhatsappOutboundRepository['markSentAndReconcile']>>

      try {
        providerMessageId = await this.#sendToMeta(dispatch)
        reconcile = await db.transaction(async (trx) => {
          return this.outboundRepo.markSentAndReconcile(trx, {
            organizationId: params.organizationId,
            dispatchId: dispatch.id,
            messageId: dispatch.messageId,
            providerMessageId,
          })
        })
      } catch (error) {
        return this.#handleSendFailure({
          organizationId: params.organizationId,
          dispatch,
          error,
        })
      }

      // Side effects after durable sent must never call markFailed / retry.
      const conversationId =
        (reconcile.receipt?.message?.conversationId as string | undefined) ??
        (await this.#loadMessageConversationId({
          organizationId: params.organizationId,
          messageId: dispatch.messageId,
        }))

      if (conversationId) {
        await this.#emitInboxMessageSent({
          organizationId: params.organizationId,
          conversationId,
          messageId: dispatch.messageId,
          dispatchId: dispatch.id,
          providerMessageId: reconcile.providerMessageId,
        })
      }

      if (reconcile.receipt?.updated) {
        try {
          await InboxStatusUpdated.dispatch({
            organizationId: params.organizationId,
            conversationId: reconcile.receipt.message.conversationId,
            messageId: reconcile.receipt.message.id,
            providerMessageId: reconcile.providerMessageId,
            previousStatus: reconcile.receipt.previousStatus,
            status: reconcile.receipt.message.status,
            providerStatusAt: new Date(
              reconcile.receipt.message.providerStatusAt as string | Date
            ).toISOString(),
          })
        } catch (error) {
          logger.error(
            {
              dispatchId: dispatch.id,
              organizationId: params.organizationId,
              messageId: dispatch.messageId,
              err: error instanceof Error ? error.message : 'unknown',
            },
            'whatsapp.outbound.inbox_status_event_failed'
          )
        }
      }

      return {
        outcome: 'sent',
        dispatchId: dispatch.id,
        messageId: dispatch.messageId,
        providerMessageId,
      }
    })
  }

  async #sendToMeta(dispatch: OutboundDispatchRow): Promise<string> {
    const { config, accessToken } = await this.configService.getDecryptedAccessToken(
      dispatch.whatsappConfigId
    )

    if (config.status !== 'connected') {
      throw WhatsappOutboundException.configNotConnected()
    }

    if (!config.phoneNumberId) {
      throw WhatsappOutboundException.configNotConnected()
    }

    const payload = dispatch.payload

    if (payload.kind === 'text') {
      const result = await this.graphClient.sendTextMessage({
        phoneNumberId: config.phoneNumberId,
        accessToken,
        to: payload.to,
        text: payload.text,
      })
      if (!result.messageId) {
        throw new MetaGraphApiError('Meta sendText returned no message id', 502, null, 'sendText')
      }
      return result.messageId
    }

    if (payload.kind === 'media') {
      const result = await this.graphClient.sendMediaMessage({
        phoneNumberId: config.phoneNumberId,
        accessToken,
        to: payload.to,
        type: payload.mediaType,
        link: payload.mediaUrl,
        caption: payload.caption,
        filename: payload.filename,
      })
      if (!result.messageId) {
        throw new MetaGraphApiError('Meta sendMedia returned no message id', 502, null, 'sendMedia')
      }
      return result.messageId
    }

    const result = await this.graphClient.sendTemplateMessage({
      phoneNumberId: config.phoneNumberId,
      accessToken,
      to: payload.to,
      templateName: payload.templateName,
      languageCode: payload.languageCode,
      components: payload.components.length > 0 ? payload.components : undefined,
    })

    if (!result.messageId) {
      throw new MetaGraphApiError(
        'Meta sendTemplate returned no message id',
        502,
        null,
        'sendTemplate'
      )
    }
    return result.messageId
  }

  async #handleSendFailure(params: {
    organizationId: string
    dispatch: OutboundDispatchRow
    error: unknown
  }): Promise<ExecuteDispatchResult> {
    const { errorMessage, errorCode } = serializeOutboundError(params.error)
    const retryable = isRetryableOutboundError(params.error)
    const terminal = isTerminalOutboundFailure({
      attempts: params.dispatch.attempts,
      retryable,
    })

    logger.warn(
      {
        outcome: terminal ? 'outbound_failed' : 'outbound_retry_scheduled',
        dispatchId: params.dispatch.id,
        organizationId: params.organizationId,
        attempts: params.dispatch.attempts,
        errorCode,
      },
      'whatsapp.outbound.send'
    )

    if (terminal) {
      await db.transaction(async (trx) => {
        await this.outboundRepo.markFailed(trx, {
          organizationId: params.organizationId,
          dispatchId: params.dispatch.id,
          messageId: params.dispatch.messageId,
          errorMessage,
          errorCode,
        })
      })

      const conversationId = await this.#loadMessageConversationId({
        organizationId: params.organizationId,
        messageId: params.dispatch.messageId,
      })
      if (conversationId) {
        await this.#emitInboxMessageFailed({
          organizationId: params.organizationId,
          conversationId,
          messageId: params.dispatch.messageId,
          dispatchId: params.dispatch.id,
          providerMessageId: null,
        })
      }

      return {
        outcome: 'failed',
        dispatchId: params.dispatch.id,
        attempts: params.dispatch.attempts,
        errorMessage,
      }
    }

    const due = nextAttemptAt(new Date(), params.dispatch.attempts)
    await db.transaction(async (trx) => {
      await this.outboundRepo.markRetryScheduled(trx, {
        organizationId: params.organizationId,
        dispatchId: params.dispatch.id,
        nextAttemptAt: due,
        errorMessage,
        errorCode,
      })
    })

    await this.#enqueueDispatchWake({
      organizationId: params.organizationId,
      dispatchId: params.dispatch.id,
      runAt: due,
    })

    return {
      outcome: 'retry_scheduled',
      dispatchId: params.dispatch.id,
      attempts: params.dispatch.attempts,
      nextAttemptAt: due.toISOString(),
      errorMessage,
    }
  }

  /**
   * Sweep stuck outbound_dispatches and re-enqueue the existing singleton wake jobs.
   * Does not claim or send — only safely wakes WHATSAPP_OUTBOUND_DISPATCH.
   */
  async recoverStuckDispatches(params?: {
    organizationId?: string
    limit?: number
  }): Promise<RecoverStuckDispatchesResult> {
    const limit = params?.limit ?? 100
    const organizationIds = params?.organizationId
      ? [params.organizationId]
      : (
          await db.from('organizations').select('id')
        ).map((row) => row.id as string)

    let woken = 0
    let remaining = limit

    for (const organizationId of organizationIds) {
      if (remaining <= 0) break

      const recoverable = await runWithTenant(organizationId, () =>
        this.outboundRepo.listRecoverableDispatches({
          organizationId,
          limit: remaining,
        })
      )

      for (const dispatch of recoverable) {
        await this.#enqueueDispatchWake({
          organizationId: dispatch.organizationId,
          dispatchId: dispatch.id,
        })
        woken += 1
        remaining -= 1
        if (remaining <= 0) break
      }
    }

    return {
      woken,
      scannedOrganizations: organizationIds.length,
    }
  }

  async #loadMessageConversationId(params: {
    organizationId: string
    messageId: string
  }): Promise<string | null> {
    const row = await db
      .from('messages')
      .where('id', params.messageId)
      .where('organizationId', params.organizationId)
      .select('conversationId')
      .first()

    return (row?.conversationId as string | undefined) ?? null
  }

  async #emitInboxMessageQueued(params: {
    organizationId: string
    conversationId: string
    messageId: string
    dispatchId: string
  }): Promise<void> {
    try {
      await InboxMessageQueued.dispatch({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        messageId: params.messageId,
        dispatchId: params.dispatchId,
        providerMessageId: null,
      })
    } catch (error) {
      logger.error(
        {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          messageId: params.messageId,
          dispatchId: params.dispatchId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'whatsapp.outbound.inbox_message_queued_event_failed'
      )
    }
  }

  async #emitInboxMessageSent(params: {
    organizationId: string
    conversationId: string
    messageId: string
    dispatchId: string
    providerMessageId: string
  }): Promise<void> {
    try {
      await InboxMessageSent.dispatch({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        messageId: params.messageId,
        dispatchId: params.dispatchId,
        providerMessageId: params.providerMessageId,
      })
    } catch (error) {
      logger.error(
        {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          messageId: params.messageId,
          dispatchId: params.dispatchId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'whatsapp.outbound.inbox_message_sent_event_failed'
      )
    }
  }

  async #emitInboxMessageFailed(params: {
    organizationId: string
    conversationId: string
    messageId: string
    dispatchId: string
    providerMessageId?: string | null
  }): Promise<void> {
    try {
      await InboxMessageFailed.dispatch({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        messageId: params.messageId,
        dispatchId: params.dispatchId,
        providerMessageId: params.providerMessageId ?? null,
      })
    } catch (error) {
      logger.error(
        {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          messageId: params.messageId,
          dispatchId: params.dispatchId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'whatsapp.outbound.inbox_message_failed_event_failed'
      )
    }
  }

  /**
   * Wake the worker for this dispatch. Failures to enqueue are logged but do not
   * roll back durable outbound_dispatches state (worker can be nudged later).
   */
  async #enqueueDispatchWake(params: {
    organizationId: string
    dispatchId: string
    runAt?: Date
  }): Promise<void> {
    try {
      const manager = await app.container.make(JobQueueManager)
      const queue = await manager.ensureStarted()
      await queue.enqueue(
        JOB_NAMES.WHATSAPP_OUTBOUND_DISPATCH,
        {
          organizationId: params.organizationId,
          dispatchId: params.dispatchId,
        },
        {
          runAt: params.runAt,
          singletonKey: params.dispatchId,
        }
      )
    } catch (error) {
      logger.error(
        {
          dispatchId: params.dispatchId,
          organizationId: params.organizationId,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'whatsapp.outbound.enqueue_failed'
      )
    }
  }

  async #loadConversationContext(
    organizationId: string,
    conversationId: string
  ): Promise<ConversationContext> {
    const conversation = await db
      .from('conversations as c')
      .join('contacts as ct', 'ct.id', 'c.contactId')
      .join('whatsapp_configs as wc', 'wc.id', 'c.whatsappConfigId')
      .where('c.id', conversationId)
      .where('c.organizationId', organizationId)
      .where('ct.organizationId', organizationId)
      .where('wc.organizationId', organizationId)
      .select(
        'c.id as conversationId',
        'c.whatsappConfigId',
        'c.status as conversationStatus',
        'ct.phoneNormalized as contactPhone',
        'wc.status as configStatus',
        'wc.phoneNumberId'
      )
      .first()

    if (!conversation) {
      throw WhatsappOutboundException.conversationNotFound()
    }

    if (conversation.configStatus !== 'connected') {
      throw WhatsappOutboundException.configNotConnected()
    }

    if (conversation.conversationStatus === 'closed') {
      throw new WhatsappOutboundException('Cannot reply to a closed conversation', {
        status: 422,
        code: 'E_OUTBOUND_CONVERSATION_CLOSED',
      })
    }

    const to = String(conversation.contactPhone ?? '').replace(/\D/g, '')
    if (!to) {
      throw WhatsappOutboundException.conversationNotFound()
    }

    const lastInboundMessage = await db
      .from('messages')
      .where('organizationId', organizationId)
      .where('conversationId', conversationId)
      .where('senderType', 'contact')
      .orderBy('createdAt', 'desc')
      .select('createdAt')
      .first()

    return {
      conversationId: conversation.conversationId as string,
      whatsappConfigId: conversation.whatsappConfigId as string,
      to,
      lastInboundMessageAt: lastInboundMessage?.createdAt
        ? new Date(lastInboundMessage.createdAt as string | Date)
        : null,
    }
  }

  #assertSessionWindow(lastInboundMessageAt: Date | null): void {
    const sessionWindowMs = 24 * 60 * 60 * 1000
    if (!lastInboundMessageAt || Date.now() - lastInboundMessageAt.getTime() > sessionWindowMs) {
      throw new WhatsappOutboundException(
        'The 24-hour customer service window has expired. Send an approved WhatsApp template to re-engage this contact.',
        {
          status: 422,
          code: 'E_OUTBOUND_SESSION_WINDOW_EXPIRED',
        }
      )
    }
  }

  async #loadMediaAsset(params: { organizationId: string; mediaAssetId: string }): Promise<{
    id: string
    fileName: string
    mimeType: string
    filePath: string
    fileSize: number
  }> {
    const mediaAsset = await db
      .from('media_assets')
      .where('id', params.mediaAssetId)
      .where('organizationId', params.organizationId)
      .select('id', 'fileName', 'mimeType', 'filePath', 'fileSize')
      .first()

    if (!mediaAsset) {
      throw new WhatsappOutboundException('Media asset not found', {
        status: 404,
        code: 'E_OUTBOUND_MEDIA_NOT_FOUND',
      })
    }

    return {
      id: mediaAsset.id as string,
      fileName: mediaAsset.fileName as string,
      mimeType: mediaAsset.mimeType as string,
      filePath: mediaAsset.filePath as string,
      fileSize: Number(mediaAsset.fileSize ?? 0),
    }
  }

  #assertMediaAsset(params: {
    mediaType: OutboundMediaType
    mediaAsset: { mimeType: string; filePath: string; fileSize: number }
  }): void {
    if (!isMimeTypeAllowedForMediaType(params.mediaType, params.mediaAsset.mimeType)) {
      throw new WhatsappOutboundException('Media asset MIME type does not match the message type', {
        status: 422,
        code: 'E_OUTBOUND_MEDIA_MIME_TYPE',
      })
    }

    const allowedHosts = parseOutboundMediaAllowedHosts(env.get('OUTBOUND_MEDIA_ALLOWED_HOSTS'))

    if (!isApprovedOutboundMediaUrl(params.mediaAsset.filePath, allowedHosts)) {
      throw new WhatsappOutboundException(
        'Media asset does not have an approved publicly accessible URL for WhatsApp delivery',
        {
          status: 422,
          code: 'E_OUTBOUND_MEDIA_LINK_UNAVAILABLE',
        }
      )
    }

    if (!isOutboundMediaSizeAllowed(params.mediaType, params.mediaAsset.fileSize)) {
      throw new WhatsappOutboundException(
        `Media asset exceeds the maximum size of ${OUTBOUND_MEDIA_MAX_BYTES[params.mediaType]} bytes for ${params.mediaType}`,
        {
          status: 422,
          code: 'E_OUTBOUND_MEDIA_FILE_SIZE',
        }
      )
    }
  }

  async #queueOutbound(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      conversationId: string
      whatsappConfigId: string
      actorUserId?: string | null
      contentType: string
      contentText: string | null
      messageTemplateId: string | null
      payload: OutboundDispatchPayload
      previewText: string
      mediaAssetId?: string
      mediaUrl?: string
      clientIdempotencyKey?: string | null
    }
  ): Promise<QueueOutboundResult> {
    const queued = await this.outboundRepo.queueOutbound(trx, {
      organizationId: params.organizationId,
      whatsappConfigId: params.whatsappConfigId,
      conversationId: params.conversationId,
      senderType: params.actorUserId ? 'agent' : 'system',
      senderId: params.actorUserId ?? null,
      contentType: params.contentType,
      contentText: params.contentText,
      messageTemplateId: params.messageTemplateId,
      payload: params.payload,
      clientIdempotencyKey: params.clientIdempotencyKey,
    })

    const now = new Date()
    if (params.mediaAssetId && params.mediaUrl) {
      await trx
        .from('messages')
        .where('id', queued.messageId)
        .where('organizationId', params.organizationId)
        .update({
          mediaAssetId: params.mediaAssetId,
          mediaUrl: params.mediaUrl,
          updatedAt: now,
        })
    }

    await trx.rawQuery(
      `UPDATE "conversations"
       SET
         "lastMessageText" = ?,
         "lastMessageAt" = ?,
         "firstResponseAt" = COALESCE("firstResponseAt", ?),
         "unreadCount" = 0,
         "updatedAt" = ?
       WHERE "id" = ? AND "organizationId" = ?`,
      [params.previewText, now, now, now, params.conversationId, params.organizationId]
    )

    return queued
  }
}
function serializeOutboundError(error: unknown): {
  errorMessage: string
  errorCode: string | null
} {
  if (error instanceof WhatsappOutboundException) {
    return {
      errorMessage: error.message.slice(0, 500),
      errorCode: error.code ?? null,
    }
  }

  if (error instanceof MetaGraphApiError) {
    return {
      errorMessage: error.message.slice(0, 500),
      errorCode: `http_${error.status}`,
    }
  }

  if (error instanceof Error) {
    return {
      errorMessage: error.message.slice(0, 500),
      errorCode: null,
    }
  }

  return { errorMessage: 'Unknown outbound error', errorCode: null }
}

