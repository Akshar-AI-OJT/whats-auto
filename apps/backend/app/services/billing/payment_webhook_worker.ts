import logger from '@adonisjs/core/services/logger'
import {
  PaymentWebhookEventRepository,
  type PaymentWebhookEventRow,
} from '#repositories/payment_webhook_event_repository'
import { SubscriptionMutationService } from '#services/billing/subscription_mutation_service'

const MAX_ATTEMPTS = 8

/**
 * Claims and processes payment_webhook_events rows (lease + mutation).
 */
export class PaymentWebhookWorker {
  constructor(
    protected webhookEvents: PaymentWebhookEventRepository = new PaymentWebhookEventRepository(),
    protected mutations: SubscriptionMutationService = new SubscriptionMutationService()
  ) {}

  async processById(webhookEventId: string): Promise<{
    outcome: 'processed' | 'ignored' | 'failed' | 'skipped'
    webhookEventId: string
  }> {
    const claimed = await this.webhookEvents.claimById({ id: webhookEventId })
    if (!claimed) {
      return { outcome: 'skipped', webhookEventId }
    }
    return this.#processClaimed(claimed)
  }

  /**
   * Recovery: claim any due pending/failed/expired-lease row.
   */
  async processNextDue(): Promise<{
    outcome: 'processed' | 'ignored' | 'failed' | 'skipped'
    webhookEventId?: string
  }> {
    const claimed = await this.webhookEvents.claimNextDue({})
    if (!claimed) {
      return { outcome: 'skipped' }
    }
    return this.#processClaimed(claimed)
  }

  async #processClaimed(row: PaymentWebhookEventRow): Promise<{
    outcome: 'processed' | 'ignored' | 'failed' | 'skipped'
    webhookEventId: string
  }> {
    const payload =
      typeof row.payload === 'object' && row.payload !== null
        ? (row.payload as Record<string, unknown>)
        : {}

    try {
      if (!this.mutations.isHandledEvent(row.eventType)) {
        await this.webhookEvents.markIgnored({
          id: row.id,
          processingError: `unhandled_event:${row.eventType}`,
        })
        return { outcome: 'ignored', webhookEventId: row.id }
      }

      const result = await this.mutations.applyEvent({
        eventType: row.eventType,
        payload,
      })

      if (result.outcome === 'ignored') {
        await this.webhookEvents.markIgnored({
          id: row.id,
          processingError: result.reason,
        })
        return { outcome: 'ignored', webhookEventId: row.id }
      }

      await this.webhookEvents.markProcessed({
        id: row.id,
        organizationId: result.organizationId,
      })

      logger.info(
        {
          webhookEventId: row.id,
          eventType: row.eventType,
          organizationId: result.organizationId,
          subscriptionId: result.subscriptionId,
        },
        'billing.payment_webhook.processed'
      )

      return { outcome: 'processed', webhookEventId: row.id }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error'
      const nextRetry = row.retryCount + 1

      if (nextRetry >= MAX_ATTEMPTS) {
        await this.webhookEvents.markFailedForRetry({
          id: row.id,
          processingError: message,
          retryCount: nextRetry,
          // far future — terminal until manual replay
          nextAttemptAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        })
      } else {
        const backoffMs = Math.min(60_000 * 2 ** Math.min(nextRetry, 6), 60 * 60 * 1000)
        await this.webhookEvents.markFailedForRetry({
          id: row.id,
          processingError: message,
          retryCount: nextRetry,
          nextAttemptAt: new Date(Date.now() + backoffMs),
        })
      }

      logger.error(
        {
          webhookEventId: row.id,
          eventType: row.eventType,
          retryCount: nextRetry,
          err: message,
        },
        'billing.payment_webhook.failed'
      )

      return { outcome: 'failed', webhookEventId: row.id }
    }
  }
}
