import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export type PaymentWebhookEventRow = {
  id: string
  provider: string
  eventId: string
  eventType: string
  organizationId: string | null
  payload: Record<string, unknown>
  status: string
  processingError: string | null
  processedAt: Date | string | null
  retryCount: number
  nextAttemptAt: Date | string
  lockedAt: Date | string | null
  lockExpiresAt: Date | string | null
  createdAt: Date | string
}

export type InsertPaymentWebhookEventParams = {
  provider: string
  eventId: string
  eventType: string
  payload: Record<string, unknown>
  organizationId?: string | null
}

type Db = typeof db | TransactionClientContract

const DEFAULT_LEASE_MS = 60_000

/**
 * Platform webhook ledger. Not tenant-RLS at insert time.
 */
export class PaymentWebhookEventRepository {
  async findByProviderEventId(
    params: { provider: string; eventId: string },
    client: Db = db
  ): Promise<PaymentWebhookEventRow | null> {
    const row = await client
      .from('payment_webhook_events')
      .where('provider', params.provider)
      .where('eventId', params.eventId)
      .first()
    return (row as PaymentWebhookEventRow | undefined) ?? null
  }

  /**
   * Insert pending event. On unique conflict, return the existing row.
   */
  async insertOrGetExisting(
    params: InsertPaymentWebhookEventParams,
    client: Db = db
  ): Promise<{ row: PaymentWebhookEventRow; inserted: boolean }> {
    try {
      const [created] = await client
        .table('payment_webhook_events')
        .insert({
          provider: params.provider,
          eventId: params.eventId,
          eventType: params.eventType,
          organizationId: params.organizationId ?? null,
          payload: params.payload,
          status: 'pending',
          retryCount: 0,
          nextAttemptAt: new Date(),
        })
        .returning('*')

      return { row: created as PaymentWebhookEventRow, inserted: true }
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === '23505') {
        const existing = await this.findByProviderEventId(
          { provider: params.provider, eventId: params.eventId },
          client
        )
        if (existing) {
          return { row: existing, inserted: false }
        }
      }
      throw error
    }
  }

  /**
   * Claim one due webhook row with a processing lease (FOR UPDATE SKIP LOCKED).
   */
  async claimNextDue(params: {
    lockOwnerHint?: string
    leaseMs?: number
    now?: Date
  }): Promise<PaymentWebhookEventRow | null> {
    const now = params.now ?? new Date()
    const leaseMs = params.leaseMs ?? DEFAULT_LEASE_MS
    const lockExpiresAt = new Date(now.getTime() + leaseMs)

    const claimed = await db.transaction(async (trx) => {
      const rows = await trx.rawQuery(
        `
        WITH candidate AS (
          SELECT id
          FROM payment_webhook_events
          WHERE
            (
              status = 'pending'
              AND "nextAttemptAt" <= ?
            )
            OR (
              status = 'failed'
              AND "nextAttemptAt" <= ?
            )
            OR (
              status = 'processing'
              AND "lockExpiresAt" IS NOT NULL
              AND "lockExpiresAt" < ?
            )
          ORDER BY "nextAttemptAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE payment_webhook_events AS e
        SET
          status = 'processing',
          "lockedAt" = ?,
          "lockExpiresAt" = ?,
          "processingError" = NULL
        FROM candidate
        WHERE e.id = candidate.id
        RETURNING e.*
        `,
        [now, now, now, now, lockExpiresAt]
      )

      const row = rows.rows?.[0] ?? rows[0]
      return (row as PaymentWebhookEventRow | undefined) ?? null
    })

    return claimed
  }

  /**
   * Claim a specific webhook row if it is due (pending/failed) or lease expired.
   */
  async claimById(params: {
    id: string
    leaseMs?: number
    now?: Date
  }): Promise<PaymentWebhookEventRow | null> {
    const now = params.now ?? new Date()
    const leaseMs = params.leaseMs ?? DEFAULT_LEASE_MS
    const lockExpiresAt = new Date(now.getTime() + leaseMs)

    return db.transaction(async (trx) => {
      const rows = await trx.rawQuery(
        `
        WITH candidate AS (
          SELECT id
          FROM payment_webhook_events
          WHERE id = ?
            AND (
              (
                status IN ('pending', 'failed')
                AND "nextAttemptAt" <= ?
              )
              OR (
                status = 'processing'
                AND "lockExpiresAt" IS NOT NULL
                AND "lockExpiresAt" < ?
              )
            )
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE payment_webhook_events AS e
        SET
          status = 'processing',
          "lockedAt" = ?,
          "lockExpiresAt" = ?,
          "processingError" = NULL
        FROM candidate
        WHERE e.id = candidate.id
        RETURNING e.*
        `,
        [params.id, now, now, now, lockExpiresAt]
      )

      const row = rows.rows?.[0] ?? rows[0]
      return (row as PaymentWebhookEventRow | undefined) ?? null
    })
  }

  async markProcessed(
    params: { id: string; organizationId?: string | null },
    client: Db = db
  ): Promise<void> {
    await client
      .from('payment_webhook_events')
      .where('id', params.id)
      .update({
        status: 'processed',
        processedAt: new Date(),
        organizationId: params.organizationId ?? undefined,
        lockedAt: null,
        lockExpiresAt: null,
        processingError: null,
      })
  }

  async markIgnored(
    params: { id: string; processingError?: string | null },
    client: Db = db
  ): Promise<void> {
    await client
      .from('payment_webhook_events')
      .where('id', params.id)
      .update({
        status: 'ignored',
        processedAt: new Date(),
        lockedAt: null,
        lockExpiresAt: null,
        processingError: params.processingError ?? null,
      })
  }

  async markFailedForRetry(params: {
    id: string
    processingError: string
    retryCount: number
    nextAttemptAt: Date
    organizationId?: string | null
  }): Promise<void> {
    await db
      .from('payment_webhook_events')
      .where('id', params.id)
      .update({
        status: 'failed',
        processingError: params.processingError,
        retryCount: params.retryCount,
        nextAttemptAt: params.nextAttemptAt,
        organizationId: params.organizationId ?? undefined,
        lockedAt: null,
        lockExpiresAt: null,
      })
  }
}
