import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { shouldApplyProviderStatus } from '#lib/meta_whatsapp/message_status'
import type { MessageMetadata, MetaWebhookStatusName } from '#lib/meta_whatsapp/types'

export type ReceiptMessageRow = {
  id: string
  organizationId: string
  conversationId: string
  senderType: string
  contentType: string
  contentText: string | null
  providerMessageId: string | null
  status: string
  errorMessage: string | null
  metadata: MessageMetadata
  occurredAt: Date | string | null
  providerStatusAt: Date | string | null
  sentAt: Date | string | null
  deliveredAt: Date | string | null
  readAt: Date | string | null
  failedAt: Date | string | null
}

export type ApplyDeliveryReceiptResult =
  | { updated: false; reason: 'not_found' | 'stale' }
  | {
      updated: true
      message: ReceiptMessageRow
      previousStatus: string
    }

export type UpsertUnmatchedReceiptResult =
  { upserted: false; reason: 'stale' } | { upserted: true; reason: 'inserted' | 'updated' }

const MESSAGE_RECEIPT_COLUMNS = [
  'id',
  'organizationId',
  'conversationId',
  'senderType',
  'contentType',
  'contentText',
  'providerMessageId',
  'status',
  'errorMessage',
  'metadata',
  'occurredAt',
  'providerStatusAt',
  'sentAt',
  'deliveredAt',
  'readAt',
  'failedAt',
] as const

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function mapReceiptMessageRow(row: Record<string, unknown>): ReceiptMessageRow {
  let metadata: MessageMetadata = {}
  const rawMetadata = row.metadata
  if (typeof rawMetadata === 'string') {
    try {
      metadata = JSON.parse(rawMetadata) as MessageMetadata
    } catch {
      metadata = {}
    }
  } else if (rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
    metadata = rawMetadata as MessageMetadata
  }

  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    conversationId: row.conversationId as string,
    senderType: row.senderType as string,
    contentType: row.contentType as string,
    contentText: (row.contentText as string | null) ?? null,
    providerMessageId: (row.providerMessageId as string | null) ?? null,
    status: row.status as string,
    errorMessage: (row.errorMessage as string | null) ?? null,
    metadata,
    occurredAt: (row.occurredAt as Date | string | null) ?? null,
    providerStatusAt: (row.providerStatusAt as Date | string | null) ?? null,
    sentAt: (row.sentAt as Date | string | null) ?? null,
    deliveredAt: (row.deliveredAt as Date | string | null) ?? null,
    readAt: (row.readAt as Date | string | null) ?? null,
    failedAt: (row.failedAt as Date | string | null) ?? null,
  }
}

/**
 * Shared message receipt application (inbound webhooks + outbound reconciliation).
 * Keeps FOR UPDATE + status-rank / timestamp rules in one place.
 */
export class MessageReceiptRepository {
  /**
   * Apply a Meta delivery receipt to an existing outbound (non-contact) message.
   */
  async applyDeliveryReceipt(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      providerMessageId: string
      status: MetaWebhookStatusName
      providerStatusAt: Date
      errorMessage: string | null
    }
  ): Promise<ApplyDeliveryReceiptResult> {
    // Lock the row for the rest of this transaction so concurrent receipts
    // cannot both decide against the same pre-update snapshot.
    const existing = await trx
      .from('messages')
      .where('organizationId', params.organizationId)
      .where('providerMessageId', params.providerMessageId)
      .whereNot('senderType', 'contact')
      .select([...MESSAGE_RECEIPT_COLUMNS])
      .forUpdate()
      .first()

    if (!existing) {
      return { updated: false, reason: 'not_found' }
    }

    const current = mapReceiptMessageRow(existing)
    const apply = shouldApplyProviderStatus({
      currentStatus: current.status,
      incomingStatus: params.status,
      currentProviderStatusAt: toDate(current.providerStatusAt),
      incomingProviderStatusAt: params.providerStatusAt,
    })

    if (!apply) {
      return { updated: false, reason: 'stale' }
    }

    const patch: Record<string, unknown> = {
      status: params.status,
      providerStatusAt: params.providerStatusAt,
      updatedAt: new Date(),
    }

    if (params.status === 'sent') {
      patch.sentAt = params.providerStatusAt
    } else if (params.status === 'delivered') {
      patch.deliveredAt = params.providerStatusAt
      if (!current.sentAt) patch.sentAt = params.providerStatusAt
    } else if (params.status === 'read') {
      patch.readAt = params.providerStatusAt
      if (!current.deliveredAt) patch.deliveredAt = params.providerStatusAt
      if (!current.sentAt) patch.sentAt = params.providerStatusAt
    } else if (params.status === 'failed') {
      patch.failedAt = params.providerStatusAt
      patch.errorMessage = params.errorMessage
    }

    // Defense in depth: refuse to move providerStatusAt backwards even if
    // the in-memory check somehow raced (should not happen after FOR UPDATE).
    const [row] = await trx
      .from('messages')
      .where('id', current.id)
      .where((query) => {
        query
          .whereNull('providerStatusAt')
          .orWhere('providerStatusAt', '<=', params.providerStatusAt)
      })
      .update(patch)
      .returning([...MESSAGE_RECEIPT_COLUMNS])

    if (!row) {
      return { updated: false, reason: 'stale' }
    }

    return {
      updated: true,
      message: mapReceiptMessageRow(row),
      previousStatus: current.status,
    }
  }

  /**
   * Buffer an early Meta receipt until the outbound wamid is persisted.
   * One logical row per (organizationId, providerMessageId); latest by rank+time wins.
   */
  async upsertUnmatchedProviderReceipt(
    trx: TransactionClientContract,
    params: {
      organizationId: string
      whatsappConfigId: string
      providerMessageId: string
      status: MetaWebhookStatusName
      providerStatusAt: Date
      errorMessage: string | null
      metadata?: Record<string, unknown>
    }
  ): Promise<UpsertUnmatchedReceiptResult> {
    const metadataJson = JSON.stringify(params.metadata ?? {})

    const insertResult = await trx.rawQuery(
      `INSERT INTO "unmatched_provider_receipts" (
         "organizationId",
         "whatsappConfigId",
         "providerMessageId",
         "status",
         "providerStatusAt",
         "errorMessage",
         "metadata"
       )
       VALUES (?, ?, ?, ?, ?, ?, ?::jsonb)
       ON CONFLICT ("organizationId", "providerMessageId")
       DO NOTHING
       RETURNING "id"`,
      [
        params.organizationId,
        params.whatsappConfigId,
        params.providerMessageId,
        params.status,
        params.providerStatusAt,
        // Lucid StrictValues excludes null; pg still binds SQL NULL correctly.
        params.errorMessage as string,
        metadataJson,
      ]
    )

    const inserted = (insertResult.rows?.[0] ?? insertResult[0]) as { id?: string } | undefined
    if (inserted?.id) {
      return { upserted: true, reason: 'inserted' }
    }

    const existing = await trx
      .from('unmatched_provider_receipts')
      .where('organizationId', params.organizationId)
      .where('providerMessageId', params.providerMessageId)
      .select('id', 'status', 'providerStatusAt', 'errorMessage', 'whatsappConfigId', 'metadata')
      .forUpdate()
      .first()

    if (!existing) {
      // Race: row vanished between ON CONFLICT and SELECT — treat as insert miss.
      return { upserted: false, reason: 'stale' }
    }

    const apply = shouldApplyProviderStatus({
      currentStatus: existing.status as string,
      incomingStatus: params.status,
      currentProviderStatusAt: toDate(existing.providerStatusAt as Date | string | null),
      incomingProviderStatusAt: params.providerStatusAt,
    })

    if (!apply) {
      return { upserted: false, reason: 'stale' }
    }

    const [updated] = await trx
      .from('unmatched_provider_receipts')
      .where('id', existing.id)
      .where((query) => {
        query
          .whereNull('providerStatusAt')
          .orWhere('providerStatusAt', '<=', params.providerStatusAt)
      })
      .update({
        whatsappConfigId: params.whatsappConfigId,
        status: params.status,
        providerStatusAt: params.providerStatusAt,
        errorMessage: params.errorMessage,
        metadata: params.metadata ?? {},
        updatedAt: new Date(),
      })
      .returning(['id'])

    if (!updated) {
      return { upserted: false, reason: 'stale' }
    }

    return { upserted: true, reason: 'updated' }
  }

  /**
   * Load and lock an unmatched receipt for outbound reconciliation (Phase 5).
   */
  async lockUnmatchedProviderReceipt(
    trx: TransactionClientContract,
    params: { organizationId: string; providerMessageId: string }
  ) {
    return trx
      .from('unmatched_provider_receipts')
      .where('organizationId', params.organizationId)
      .where('providerMessageId', params.providerMessageId)
      .forUpdate()
      .first()
  }

  async deleteUnmatchedProviderReceipt(
    trx: TransactionClientContract,
    params: { organizationId: string; providerMessageId: string }
  ): Promise<void> {
    await trx
      .from('unmatched_provider_receipts')
      .where('organizationId', params.organizationId)
      .where('providerMessageId', params.providerMessageId)
      .delete()
  }
}
