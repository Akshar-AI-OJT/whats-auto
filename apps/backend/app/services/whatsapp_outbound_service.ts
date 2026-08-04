import logger from '@adonisjs/core/services/logger'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import InboxStatusUpdated from '#events/inbox_status_updated'
import WhatsappOutboundException from '#exceptions/whatsapp_outbound_exception'
import {
  MetaGraphApiError,
  createMetaGraphClient,
  type MetaGraphClient,
} from '#lib/meta_whatsapp/graph_client'
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
  }): Promise<QueueOutboundResult> {
    const text = params.text.trim()
    if (!text) {
      throw WhatsappOutboundException.emptyText()
    }

    return runWithTenant(params.organizationId, async () => {
      const ctx = await this.#loadConversationContext(params.organizationId, params.conversationId)

      const payload: OutboundDispatchPayload = {
        kind: 'text',
        to: ctx.to,
        text,
      }

      const queued = await db.transaction(async (trx) => {
        return this.outboundRepo.queueOutbound(trx, {
          organizationId: params.organizationId,
          whatsappConfigId: ctx.whatsappConfigId,
          conversationId: params.conversationId,
          senderType: params.actorUserId ? 'agent' : 'system',
          senderId: params.actorUserId ?? null,
          contentType: 'text',
          contentText: text,
          messageTemplateId: null,
          payload,
        })
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
        return this.outboundRepo.queueOutbound(trx, {
          organizationId: params.organizationId,
          whatsappConfigId: ctx.whatsappConfigId,
          conversationId: params.conversationId,
          senderType: params.actorUserId ? 'agent' : 'system',
          senderId: params.actorUserId ?? null,
          contentType: 'template',
          contentText: template.bodyText ?? null,
          messageTemplateId: template.id,
          payload,
        })
      })

      await this.#enqueueDispatchWake({
        organizationId: params.organizationId,
        dispatchId: queued.dispatchId,
      })

      return queued
    })
  }

  /**
   * Claim → Meta send → persist success/failure. Emits InboxStatusUpdated only when
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

  async #loadConversationContext(organizationId: string, conversationId: string) {
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
        'ct.phone as contactPhone',
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

    const to = String(conversation.contactPhone ?? '').replace(/\D/g, '')
    if (!to) {
      throw WhatsappOutboundException.conversationNotFound()
    }

    return {
      conversationId: conversation.conversationId as string,
      whatsappConfigId: conversation.whatsappConfigId as string,
      to,
    }
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
