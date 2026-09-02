import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import WhatsappWebhookException from '#exceptions/whatsapp_webhook_exception'
import { verifyMetaWebhookSignature } from '#lib/meta_whatsapp/webhook_signature'
import type { MetaWebhookPayload } from '#lib/meta_whatsapp/types'
import WhatsappWebhookIngestionService from '#services/whatsapp_webhook_ingestion_service'

/**
 * Platform webhook orchestration for Meta Cloud API.
 * Verifies HMAC, then dispatches every change value to ingestion.
 */
@inject()
export class WhatsappWebhookService {
  constructor(private ingestion: WhatsappWebhookIngestionService) {}

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
      logger.warn(
        {
          mode: params.mode ?? null,
          hasVerifyToken: Boolean(params.verifyToken),
          hasChallenge: Boolean(params.challenge),
        },
        'whatsapp.webhook.verify_failed'
      )
      throw WhatsappWebhookException.invalidVerifyToken()
    }

    logger.info({ mode: params.mode }, 'whatsapp.webhook.verify_ok')
    return params.challenge
  }

  /**
   * Verify Meta signature, then process payload.
   */
  async handleInbound(params: {
    rawBody: string | null
    signatureHeader: string | undefined
    payload: MetaWebhookPayload
  }): Promise<void> {
    logger.info(
      {
        hasRawBody: params.rawBody !== null,
        rawBodyLength: params.rawBody?.length ?? 0,
        hasSignature: Boolean(params.signatureHeader),
        object: params.payload?.object ?? null,
        entryCount: params.payload?.entry?.length ?? 0,
      },
      'whatsapp.webhook.hit'
    )

    if (params.rawBody === null || params.rawBody === undefined) {
      logger.warn({ outcome: 'missing_raw_body' }, 'whatsapp.webhook.rejected')
      throw WhatsappWebhookException.missingRawBody()
    }

    const appSecret = env.get('META_APP_SECRET').release()
    const valid = verifyMetaWebhookSignature(params.rawBody, params.signatureHeader, appSecret)

    if (!valid) {
      logger.warn(
        {
          outcome: 'invalid_signature',
          hasSignature: Boolean(params.signatureHeader),
          rawBodyLength: params.rawBody.length,
        },
        'whatsapp.webhook.rejected'
      )
      throw WhatsappWebhookException.invalidSignature()
    }

    await this.processPayload(params.payload)
  }

  /**
   * Walk every entry[].changes[] and dispatch to ingestion.
   * Unknown/malformed values are logged and skipped; DB errors propagate for Meta retry.
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

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        await this.ingestion.processChangeValue({
          field: change.field,
          value: change.value,
        })
      }
    }
  }
}
