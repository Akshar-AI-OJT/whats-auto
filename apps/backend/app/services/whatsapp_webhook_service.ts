import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import WhatsappWebhookException from '#exceptions/whatsapp_webhook_exception'
import { verifyMetaWebhookSignature } from '#lib/meta_whatsapp/webhook_signature'
import type { MetaWebhookPayload } from '#lib/meta_whatsapp/types'
import { WhatsappWebhookIngestionService } from '#services/whatsapp_webhook_ingestion_service'

/**
 * Platform webhook orchestration for Meta Cloud API.
 *
 * Verifies subscription + HMAC, then persists inbox messages/receipts.
 */
export class WhatsappWebhookService {
  constructor(
    private ingestion: WhatsappWebhookIngestionService = new WhatsappWebhookIngestionService()
  ) {}

  /**
   * Meta GET subscription handshake.
   * Returns the challenge string to echo when valid.
   */
  verifyChallenge(params: {
    mode: string | undefined
    verifyToken: string | undefined
    challenge: string | undefined
  }): string {
    const expected = env.get('WHATSAPP_VERIFY_TOKEN')

    if (
      params.mode !== 'subscribe' ||
      !params.verifyToken ||
      !params.challenge ||
      params.verifyToken !== expected
    ) {
      throw WhatsappWebhookException.invalidVerifyToken()
    }

    return params.challenge
  }

  /**
   * Verify Meta signature, then ingest payload into the inbox.
   */
  async handleInbound(params: {
    rawBody: string | null
    signatureHeader: string | undefined
    payload: MetaWebhookPayload
  }): Promise<void> {
    if (params.rawBody === null || params.rawBody === undefined) {
      throw WhatsappWebhookException.missingRawBody()
    }

    const appSecret = env.get('META_APP_SECRET').release()
    const valid = verifyMetaWebhookSignature(params.rawBody, params.signatureHeader, appSecret)

    if (!valid) {
      throw WhatsappWebhookException.invalidSignature()
    }

    await this.processPayload(params.payload)
  }

  /**
   * Single place for webhook side-effects (messages, statuses).
   */
  protected async processPayload(payload: MetaWebhookPayload): Promise<void> {
    const entryCount = payload.entry?.length ?? 0
    const fields =
      payload.entry?.flatMap((entry) => entry.changes?.map((c) => c.field).filter(Boolean) ?? []) ??
      []

    logger.info(
      {
        object: payload.object,
        entryCount,
        fields,
      },
      'whatsapp.webhook.received'
    )

    await this.ingestion.ingestPayload(payload)
  }
}
