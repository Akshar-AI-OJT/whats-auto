import db from '@adonisjs/lucid/services/db'
import WhatsappOutboundException from '#exceptions/whatsapp_outbound_exception'
import { WhatsappWebhookRepository } from '#repositories/whatsapp_webhook_repository'
import { runWithTenant } from '#services/tenant_context'

export class IntegrationRecipientService {
  constructor(private webhookRepo = new WhatsappWebhookRepository()) {}

  /**
   * Upsert a contact by phone and find-or-create the inbox conversation
   * on the tenant's connected WhatsApp config.
   */
  async ensureConversationForPhone(params: {
    organizationId: string
    phone: string
    profileName?: string | null
  }): Promise<{
    contactId: string
    conversationId: string
    whatsappConfigId: string
  }> {
    return runWithTenant(params.organizationId, async () => {
      return db.transaction(async (trx) => {
        const whatsappConfigId = await this.webhookRepo.findConnectedConfigId(
          trx,
          params.organizationId
        )
        if (!whatsappConfigId) {
          throw WhatsappOutboundException.configNotConnected()
        }

        const contact = await this.webhookRepo.upsertContactByWaId(trx, {
          organizationId: params.organizationId,
          waId: params.phone,
          profileName: params.profileName ?? null,
        })

        const conversation = await this.webhookRepo.findOrCreateConversation(trx, {
          organizationId: params.organizationId,
          whatsappConfigId,
          contactId: contact.id,
        })

        return {
          contactId: contact.id,
          conversationId: conversation.id,
          whatsappConfigId,
        }
      })
    })
  }
}
