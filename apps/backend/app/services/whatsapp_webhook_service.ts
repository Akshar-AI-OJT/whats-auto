import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import WhatsappWebhookException from '#exceptions/whatsapp_webhook_exception'
import { verifyMetaWebhookSignature } from '#lib/meta_whatsapp/webhook_signature'
import type { MetaWebhookPayload } from '#lib/meta_whatsapp/types'

/**
 * Platform webhook orchestration for Meta Cloud API.
 *
 * Phase 1: verify subscription + HMAC, log payload summary, ack fast.
 * Phase 3+: resolve phone_number_id → whatsapp_configs → persist inbox events.
 */
export class WhatsappWebhookService {
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
   * Verify Meta signature, then process payload (Phase 1: log only).
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
   * Extension point for Phase 3+ event dispatch (messages, statuses, templates).
   * Keep this method the single place webhook side-effects are added.
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
  }
}
