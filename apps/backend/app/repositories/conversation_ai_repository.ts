import db from '@adonisjs/lucid/services/db'
import { ConversationAiMode } from '#enums/conversation_ai_mode'

export type ConversationAiState = {
  id: string
  aiMode: string
  attributedCampaignId: string | null
  contactId: string
}

export class ConversationAiRepository {
  async findById(params: {
    organizationId: string
    conversationId: string
  }): Promise<ConversationAiState | null> {
    const row = await db
      .from('conversations')
      .where('id', params.conversationId)
      .where('organizationId', params.organizationId)
      .select('id', 'aiMode', 'attributedCampaignId', 'contactId')
      .first()

    if (!row) return null

    return {
      id: row.id as string,
      aiMode: row.aiMode as string,
      attributedCampaignId: (row.attributedCampaignId as string | null) ?? null,
      contactId: row.contactId as string,
    }
  }

  async stampHandover(params: {
    organizationId: string
    conversationId: string
    reason: string
  }): Promise<void> {
    await db
      .from('conversations')
      .where('id', params.conversationId)
      .where('organizationId', params.organizationId)
      .where('aiMode', ConversationAiMode.AI_AUTO)
      .update({
        aiMode: ConversationAiMode.HANDOVER,
        aiHandoverReason: params.reason,
      })
  }
}
