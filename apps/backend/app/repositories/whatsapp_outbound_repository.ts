import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import WhatsappOutboundException from '#exceptions/whatsapp_outbound_exception'
import {
  MessageReceiptRepository,
  type ApplyDeliveryReceiptResult,
} from '#repositories/message_receipt_repository'
import type { MetaSendTemplateComponent, MetaWebhookStatusName } from '#lib/meta_whatsapp/types'

export const OUTBOUND_LEASE_MINUTES = 5

const IDEMPOTENCY_FINGERPRINT_META_KEY = 'idempotencyFingerprint'
const CLIENT_IDEMPOTENCY_SAVEPOINT = 'outbound_client_idempotency'

/** Postgres unique_violation, including Knex/Lucid-wrapped errors. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: string }).code
    if (code === '23505') return true
    current = (current as { cause?: unknown }).cause ?? (current as { original?: unknown }).original
  }
  return false
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (raw === null) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object') {
    return raw as Record<string, unknown>
  }
  return {}
}

function buildIdempotencyFingerprint(params: {
  contentType: string
  contentText: string | null
  messageTemplateId: string | null
  payload: OutboundDispatchPayload
}): string {
  return JSON.stringify({
    contentType: params.contentType,
    contentText: params.contentText,
    messageTemplateId: params.messageTemplateId,
    payload: params.payload,
  })
}

function readIdempotencyFingerprint(metadata: unknown): string | null {
  const value = parseMetadata(metadata)[IDEMPOTENCY_FINGERPRINT_META_KEY]
  return typeof value === 'string' ? value : null
}

export type OutboundTextPayload = {
  kind: 'text'
  to: string
  text: string
}

export type OutboundMediaPayload = {
  kind: 'media'
  to: string
  mediaType: 'image' | 'document'
  mediaAssetId: string
  mediaUrl: string
  caption?: string
  filename?: string
}

export type OutboundTemplatePayload = {
  kind: 'template'
  to: string
  templateId: string
  templateName: string
  languageCode: string
  components: MetaSendTemplateComponent[]
}

export type OutboundDispatchPayload =
  OutboundTextPayload | OutboundTemplatePayload | OutboundMediaPayload

export type OutboundDispatchRow = {
  id: string
  organizationId: string
  whatsappConfigId: string
  messageId: string
  status: string
  attempts: number
  nextAttemptAt: Date | string | null
  lockOwner: string | null
  lockedAt: Date | string | null
  lockExpiresAt: Date | string | null
  payload: OutboundDispatchPayload
  errorMessage: string | null
  errorCode: string | null
  completedAt: Date | string | null
}

export type ClaimDispatchResult =
  | { outcome: 'claimed'; dispatch: OutboundDispatchRow }
  | { outcome: 'already_sent'; dispatch: OutboundDispatchRow }
  | { outcome: 'not_claimed' }

export type MarkSentReconcileResult = {
  messageId: string
  providerMessageId: string
  receipt: ApplyDeliveryReceiptResult | null
}

/**
 * Persistence for outbound queue, claim/lease, completion, and unmatched reconciliation.
 */
export class WhatsappOutboundRepository {
  constructor(private receipts: MessageReceiptRepository = new MessageReceiptRepository()) {}

  /**
   * Insert queued message + pending dispatch atomically.
   * When clientIdempotencyKey is set for an agent sender, retries reuse the existing
   * message/dispatch; a different payload for the same key conflicts.
   * Does not touch providerMessageId (Meta wamid reconciliation stays elsewhere).
   */
  async queueOutbound(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      whatsappConfigId: string
      conversationId: string
      senderType: 'agent' | 'system'
      senderId: string | null
      contentType: string
      contentText: string | null
      messageTemplateId: string | null
      payload: OutboundDispatchPayload
      metadata?: Record<string, unknown>
      clientIdempotencyKey?: string | null
    }
  ): Promise<{ messageId: string; dispatchId: string }> {
    const now = new Date()
    const clientIdempotencyKey = params.clientIdempotencyKey?.trim() || null
    const fingerprint = buildIdempotencyFingerprint({
      contentType: params.contentType,
      contentText: params.contentText,
      messageTemplateId: params.messageTemplateId,
      payload: params.payload,
    })

    if (clientIdempotencyKey && params.senderId) {
      const existing = await this.findMessageByClientIdempotencyKey(trx, {
        organizationId: params.organizationId,
        senderId: params.senderId,
        clientIdempotencyKey,
      })
      if (existing) {
        return this.resolveClientIdempotentReplay(trx, {
          organizationId: params.organizationId,
          existing,
          fingerprint,
        })
      }
    }

    const metadata: Record<string, unknown> = {
      ...(params.metadata ?? {}),
    }
    if (clientIdempotencyKey) {
      metadata[IDEMPOTENCY_FINGERPRINT_META_KEY] = fingerprint
    }

    await trx.rawQuery(`SAVEPOINT ${CLIENT_IDEMPOTENCY_SAVEPOINT}`)

    try {
      const [message] = await trx
        .table('messages')
        .insert({
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          senderType: params.senderType,
          senderId: params.senderId,
          contentType: params.contentType,
          contentText: params.contentText,
          messageTemplateId: params.messageTemplateId,
          clientIdempotencyKey,
          status: 'queued',
          occurredAt: now,
          metadata,
          createdAt: now,
          updatedAt: now,
        })
        .returning(['id'])

      const [dispatch] = await trx
        .table('outbound_dispatches')
        .insert({
          organizationId: params.organizationId,
          whatsappConfigId: params.whatsappConfigId,
          messageId: message.id,
          status: 'pending',
          attempts: 0,
          payload: params.payload,
          createdAt: now,
          updatedAt: now,
        })
        .returning(['id'])

      await trx.rawQuery(`RELEASE SAVEPOINT ${CLIENT_IDEMPOTENCY_SAVEPOINT}`)

      return {
        messageId: message.id as string,
        dispatchId: dispatch.id as string,
      }
    } catch (error) {
      if (clientIdempotencyKey && params.senderId && isUniqueViolation(error)) {
        await trx.rawQuery(`ROLLBACK TO SAVEPOINT ${CLIENT_IDEMPOTENCY_SAVEPOINT}`)

        const existing = await this.findMessageByClientIdempotencyKey(trx, {
          organizationId: params.organizationId,
          senderId: params.senderId,
          clientIdempotencyKey,
        })
        if (!existing) {
          await trx.rawQuery(`RELEASE SAVEPOINT ${CLIENT_IDEMPOTENCY_SAVEPOINT}`).catch(() => {})
          throw error
        }

        const replayed = await this.resolveClientIdempotentReplay(trx, {
          organizationId: params.organizationId,
          existing,
          fingerprint,
        })
        await trx.rawQuery(`RELEASE SAVEPOINT ${CLIENT_IDEMPOTENCY_SAVEPOINT}`)
        return replayed
      }

      await trx.rawQuery(`ROLLBACK TO SAVEPOINT ${CLIENT_IDEMPOTENCY_SAVEPOINT}`).catch(() => {})
      throw error
    }
  }

  private async findMessageByClientIdempotencyKey(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      senderId: string
      clientIdempotencyKey: string
    }
  ) {
    return trx
      .from('messages')
      .where('organizationId', params.organizationId)
      .where('senderId', params.senderId)
      .where('clientIdempotencyKey', params.clientIdempotencyKey)
      .select('id', 'contentType', 'contentText', 'messageTemplateId', 'metadata')
      .first()
  }

  private async resolveClientIdempotentReplay(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      existing: Record<string, unknown>
      fingerprint: string
    }
  ): Promise<{ messageId: string; dispatchId: string }> {
    const dispatch = await trx
      .from('outbound_dispatches')
      .where('organizationId', params.organizationId)
      .where('messageId', params.existing.id as string)
      .orderBy('createdAt', 'asc')
      .select('id', 'payload')
      .first()

    if (!dispatch) {
      throw WhatsappOutboundException.dispatchNotFound()
    }

    let existingFingerprint = readIdempotencyFingerprint(params.existing.metadata)
    if (!existingFingerprint) {
      let payload = dispatch.payload as OutboundDispatchPayload
      if (typeof payload === 'string') {
        payload = JSON.parse(payload) as OutboundDispatchPayload
      }
      existingFingerprint = buildIdempotencyFingerprint({
        contentType: params.existing.contentType as string,
        contentText: (params.existing.contentText as string | null) ?? null,
        messageTemplateId: (params.existing.messageTemplateId as string | null) ?? null,
        payload,
      })
    }

    if (existingFingerprint !== params.fingerprint) {
      throw WhatsappOutboundException.idempotencyKeyConflict()
    }

    return {
      messageId: params.existing.id as string,
      dispatchId: dispatch.id as string,
    }
  }

  /**
   * List dispatches that should be re-woken: pending, due retries, and expired leases.
   * Must run inside runWithTenant(organizationId) so RLS can see the rows.
   */
  async listRecoverableDispatches(params: {
    organizationId: string
    limit?: number
    now?: Date
  }): Promise<Array<{ id: string; organizationId: string; status: string }>> {
    const now = params.now ?? new Date()
    const limit = params.limit ?? 100

    const rows = await db
      .from('outbound_dispatches')
      .where('organizationId', params.organizationId)
      .where((query) => {
        query
          .where('status', 'pending')
          .orWhere((retry) => {
            retry.where('status', 'retry_scheduled').where((due) => {
              due.whereNull('nextAttemptAt').orWhere('nextAttemptAt', '<=', now)
            })
          })
          .orWhere((expired) => {
            expired
              .where('status', 'processing')
              .whereNotNull('lockExpiresAt')
              .where('lockExpiresAt', '<', now)
          })
      })
      .orderBy('updatedAt', 'asc')
      .limit(limit)
      .select('id', 'organizationId', 'status')

    return rows.map((row) => ({
      id: row.id as string,
      organizationId: row.organizationId as string,
      status: row.status as string,
    }))
  }

  /**
   * Atomically claim an eligible dispatch (pending / due retry / expired lease).
   */
  async claimDispatch(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      dispatchId: string
      lockOwner: string
      now?: Date
    }
  ): Promise<ClaimDispatchResult> {
    const now = params.now ?? new Date()
    const lockExpiresAt = new Date(now.getTime() + OUTBOUND_LEASE_MINUTES * 60_000)

    const result = await trx.rawQuery(
      `WITH claimed AS (
         SELECT "id"
         FROM "outbound_dispatches"
         WHERE "id" = ?
           AND "organizationId" = ?
           AND (
             "status" = 'pending'
             OR (
               "status" = 'retry_scheduled'
               AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ?)
             )
             OR (
               "status" = 'processing'
               AND "lockExpiresAt" IS NOT NULL
               AND "lockExpiresAt" < ?
             )
           )
         FOR UPDATE SKIP LOCKED
       )
       UPDATE "outbound_dispatches" AS d
       SET
         "status" = 'processing',
         "attempts" = d."attempts" + 1,
         "lockOwner" = ?,
         "lockedAt" = ?,
         "lockExpiresAt" = ?,
         "nextAttemptAt" = NULL,
         "errorMessage" = NULL,
         "errorCode" = NULL,
         "updatedAt" = ?
       FROM claimed
       WHERE d."id" = claimed."id"
       RETURNING
         d."id",
         d."organizationId",
         d."whatsappConfigId",
         d."messageId",
         d."status",
         d."attempts",
         d."nextAttemptAt",
         d."lockOwner",
         d."lockedAt",
         d."lockExpiresAt",
         d."payload",
         d."errorMessage",
         d."errorCode",
         d."completedAt"`,
      [
        params.dispatchId,
        params.organizationId,
        now,
        now,
        params.lockOwner,
        now,
        lockExpiresAt,
        now,
      ]
    )

    const row = (result.rows?.[0] ?? result[0]) as Record<string, unknown> | undefined
    if (row) {
      return { outcome: 'claimed', dispatch: this.mapDispatchRow(row) }
    }

    const existing = await trx
      .from('outbound_dispatches')
      .where('id', params.dispatchId)
      .where('organizationId', params.organizationId)
      .first()

    if (!existing) {
      return { outcome: 'not_claimed' }
    }

    if (existing.status === 'sent') {
      return { outcome: 'already_sent', dispatch: this.mapDispatchRow(existing) }
    }

    return { outcome: 'not_claimed' }
  }

  /**
   * Persist Meta wamid as sent, complete dispatch, apply any unmatched receipt.
   * Early receipts may carry a Meta timestamp slightly before local persist time;
   * leave providerStatusAt unset until reconcile so rank/time rules still apply them.
   */
  async markSentAndReconcile(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      dispatchId: string
      messageId: string
      providerMessageId: string
      sentAt?: Date
    }
  ): Promise<MarkSentReconcileResult> {
    const sentAt = params.sentAt ?? new Date()

    const unmatched = await this.receipts.lockUnmatchedProviderReceipt(trx, {
      organizationId: params.organizationId,
      providerMessageId: params.providerMessageId,
    })

    await trx
      .from('messages')
      .where('id', params.messageId)
      .where('organizationId', params.organizationId)
      .update({
        providerMessageId: params.providerMessageId,
        status: 'sent',
        sentAt,
        // Only stamp providerStatusAt when no early receipt will overwrite it.
        providerStatusAt: unmatched ? null : sentAt,
        updatedAt: sentAt,
      })

    await trx
      .from('outbound_dispatches')
      .where('id', params.dispatchId)
      .where('organizationId', params.organizationId)
      .update({
        status: 'sent',
        lockOwner: null,
        lockedAt: null,
        lockExpiresAt: null,
        nextAttemptAt: null,
        completedAt: sentAt,
        errorMessage: null,
        errorCode: null,
        updatedAt: sentAt,
      })

    let receipt: ApplyDeliveryReceiptResult | null = null

    if (unmatched) {
      receipt = await this.receipts.applyDeliveryReceipt(trx, {
        organizationId: params.organizationId,
        providerMessageId: params.providerMessageId,
        status: unmatched.status as MetaWebhookStatusName,
        providerStatusAt: new Date(unmatched.providerStatusAt as string | Date),
        errorMessage: (unmatched.errorMessage as string | null) ?? null,
      })

      await this.receipts.deleteUnmatchedProviderReceipt(trx, {
        organizationId: params.organizationId,
        providerMessageId: params.providerMessageId,
      })

      // If the buffered receipt was stale relative to something else, still ensure
      // a provider stamp exists for the successful send.
      if (!receipt.updated) {
        await trx
          .from('messages')
          .where('id', params.messageId)
          .where('organizationId', params.organizationId)
          .whereNull('providerStatusAt')
          .update({
            providerStatusAt: sentAt,
            updatedAt: sentAt,
          })
      }
    }

    return {
      messageId: params.messageId,
      providerMessageId: params.providerMessageId,
      receipt,
    }
  }

  async markRetryScheduled(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      dispatchId: string
      nextAttemptAt: Date
      errorMessage: string
      errorCode: string | null
    }
  ): Promise<void> {
    const now = new Date()
    await trx
      .from('outbound_dispatches')
      .where('id', params.dispatchId)
      .where('organizationId', params.organizationId)
      .whereIn('status', ['pending', 'processing', 'retry_scheduled'])
      .update({
        status: 'retry_scheduled',
        nextAttemptAt: params.nextAttemptAt,
        lockOwner: null,
        lockedAt: null,
        lockExpiresAt: null,
        errorMessage: params.errorMessage,
        errorCode: params.errorCode,
        updatedAt: now,
      })
  }

  async markFailed(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      dispatchId: string
      messageId: string
      errorMessage: string
      errorCode: string | null
      failedAt?: Date
    }
  ): Promise<void> {
    const failedAt = params.failedAt ?? new Date()

    // Never overwrite a durable success (sent/delivered/read) if a side effect fails later.
    await trx
      .from('messages')
      .where('id', params.messageId)
      .where('organizationId', params.organizationId)
      .whereIn('status', ['queued'])
      .update({
        status: 'failed',
        failedAt,
        errorMessage: params.errorMessage,
        updatedAt: failedAt,
      })

    await trx
      .from('outbound_dispatches')
      .where('id', params.dispatchId)
      .where('organizationId', params.organizationId)
      .whereIn('status', ['pending', 'processing', 'retry_scheduled'])
      .update({
        status: 'failed',
        lockOwner: null,
        lockedAt: null,
        lockExpiresAt: null,
        nextAttemptAt: null,
        completedAt: failedAt,
        errorMessage: params.errorMessage,
        errorCode: params.errorCode,
        updatedAt: failedAt,
      })
  }

  mapDispatchRow(row: Record<string, unknown>): OutboundDispatchRow {
    let payload = row.payload as OutboundDispatchPayload
    if (typeof payload === 'string') {
      payload = JSON.parse(payload) as OutboundDispatchPayload
    }

    return {
      id: row.id as string,
      organizationId: row.organizationId as string,
      whatsappConfigId: row.whatsappConfigId as string,
      messageId: row.messageId as string,
      status: row.status as string,
      attempts: Number(row.attempts ?? 0),
      nextAttemptAt: (row.nextAttemptAt as Date | string | null) ?? null,
      lockOwner: (row.lockOwner as string | null) ?? null,
      lockedAt: (row.lockedAt as Date | string | null) ?? null,
      lockExpiresAt: (row.lockExpiresAt as Date | string | null) ?? null,
      payload,
      errorMessage: (row.errorMessage as string | null) ?? null,
      errorCode: (row.errorCode as string | null) ?? null,
      completedAt: (row.completedAt as Date | string | null) ?? null,
    }
  }
}
