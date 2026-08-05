import app from '@adonisjs/core/services/app'
import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import BillingWebhookException from '#exceptions/billing_webhook_exception'
import { verifyRazorpayWebhookSignature } from '#lib/razorpay/webhook_signature'
import {
  PaymentWebhookEventRepository,
  type PaymentWebhookEventRow,
} from '#repositories/payment_webhook_event_repository'
import { JOB_NAMES } from '#services/job_queue/job_names'
import JobQueueManager from '#services/job_queue/job_queue_manager'

const PROVIDER = 'razorpay'

export type RazorpayWebhookBody = {
  event?: string
  payload?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Platform Razorpay billing webhook ingress: verify → ledger insert → wake.
 * Does not mutate subscriptions.
 */
@inject()
export class BillingRazorpayWebhookService {
  constructor(protected webhookEvents: PaymentWebhookEventRepository) {}

  async handleInbound(params: {
    rawBody: string | null
    signatureHeader: string | undefined
    eventIdHeader: string | undefined
    body: RazorpayWebhookBody
  }): Promise<{ webhookEventId: string; inserted: boolean; eventType: string }> {
    if (params.rawBody === null || params.rawBody === undefined) {
      throw BillingWebhookException.missingRawBody()
    }

    const secret = env.get('RAZORPAY_WEBHOOK_SECRET').release()
    const valid = verifyRazorpayWebhookSignature(params.rawBody, params.signatureHeader, secret)
    if (!valid) {
      throw BillingWebhookException.invalidSignature()
    }

    const eventType = typeof params.body.event === 'string' ? params.body.event : null
    if (!eventType) {
      throw BillingWebhookException.invalidPayload()
    }

    const eventId = this.#buildEventId({
      headerEventId: params.eventIdHeader,
      eventType,
      body: params.body,
    })

    const { row, inserted } = await this.webhookEvents.insertOrGetExisting({
      provider: PROVIDER,
      eventId,
      eventType,
      payload: params.body as Record<string, unknown>,
    })

    logger.info(
      {
        webhookEventId: row.id,
        eventId,
        eventType,
        inserted,
      },
      'billing.razorpay.webhook.accepted'
    )

    if (inserted || row.status === 'pending' || row.status === 'failed') {
      await this.#enqueueWake(row)
    }

    return { webhookEventId: row.id, inserted, eventType }
  }

  #buildEventId(params: {
    headerEventId: string | undefined
    eventType: string
    body: RazorpayWebhookBody
  }): string {
    if (params.headerEventId && params.headerEventId.trim()) {
      return params.headerEventId.trim()
    }

    const entityId = this.#primaryEntityId(params.eventType, params.body)
    if (!entityId) {
      throw BillingWebhookException.invalidPayload()
    }
    return `${params.eventType}:${entityId}`
  }

  #primaryEntityId(eventType: string, body: RazorpayWebhookBody): string | null {
    const payload = body.payload
    if (!payload || typeof payload !== 'object') {
      return null
    }

    const pick = (key: string): string | null => {
      const bucket = (payload as Record<string, unknown>)[key]
      if (!bucket || typeof bucket !== 'object') return null
      const entity = (bucket as Record<string, unknown>).entity
      if (!entity || typeof entity !== 'object') return null
      const id = (entity as Record<string, unknown>).id
      return typeof id === 'string' && id.length > 0 ? id : null
    }

    if (eventType.startsWith('payment.')) {
      return pick('payment')
    }
    if (eventType.startsWith('subscription.')) {
      return pick('subscription') ?? pick('payment')
    }
    return pick('payment') ?? pick('subscription') ?? pick('invoice')
  }

  async #enqueueWake(row: PaymentWebhookEventRow): Promise<void> {
    try {
      const manager = await app.container.make(JobQueueManager)
      const queue = await manager.ensureStarted()
      await queue.enqueue(
        JOB_NAMES.BILLING_PAYMENT_WEBHOOK_PROCESS,
        { webhookEventId: row.id },
        { singletonKey: row.id }
      )
    } catch (error) {
      logger.error(
        {
          webhookEventId: row.id,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'billing.razorpay.webhook.enqueue_failed'
      )
    }
  }
}
