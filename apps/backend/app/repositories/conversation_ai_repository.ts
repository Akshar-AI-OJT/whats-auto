import db from '@adonisjs/lucid/services/db'
import { ConversationAiMode } from '#enums/conversation_ai_mode'

export type ConversationAiState = {
  id: string
  aiMode: string
  aiHandoverReason: string | null
  aiSummary: string | null
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
      .select('id', 'aiMode', 'aiHandoverReason', 'aiSummary', 'attributedCampaignId', 'contactId')
      .first()

    if (!row) return null

    return {
      id: row.id as string,
      aiMode: row.aiMode as string,
      aiHandoverReason: (row.aiHandoverReason as string | null) ?? null,
      aiSummary: (row.aiSummary as string | null) ?? null,
      attributedCampaignId: (row.attributedCampaignId as string | null) ?? null,
      contactId: row.contactId as string,
    }
  }

  async updateAiSummary(params: {
    organizationId: string
    conversationId: string
    summary: string
  }): Promise<void> {
    await db
      .from('conversations')
      .where('id', params.conversationId)
      .where('organizationId', params.organizationId)
      .update({ aiSummary: params.summary })
  }

  async updateAiMode(params: {
    organizationId: string
    conversationId: string
    from: string[]
    to: ConversationAiMode
    handoverReason: string | null
  }): Promise<boolean> {
    const updated = await db
      .from('conversations')
      .where('id', params.conversationId)
      .where('organizationId', params.organizationId)
      .whereIn('aiMode', params.from)
      .update({
        aiMode: params.to,
        aiHandoverReason: params.handoverReason,
      })

    return Number(updated) > 0
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
