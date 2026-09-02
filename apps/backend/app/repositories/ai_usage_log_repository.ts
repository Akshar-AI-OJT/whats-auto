import db from '@adonisjs/lucid/services/db'
import type { AiUsageDecision } from '#enums/ai_usage_decision'

export type InsertAiUsageLogParams = {
  organizationId: string
  conversationId: string
  messageId?: string | null
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
  modelName: string
  latencyMs: number
  decision: AiUsageDecision
  retrievalScore?: number | null
}

export class AiUsageLogRepository {
  async insert(params: InsertAiUsageLogParams): Promise<void> {
    await db.table('ai_usage_logs').insert({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      messageId: params.messageId ?? null,
      promptTokens: params.promptTokens ?? 0,
      completionTokens: params.completionTokens ?? 0,
      totalTokens: params.totalTokens ?? 0,
      estimatedCostUsd: params.estimatedCostUsd ?? 0,
      modelName: params.modelName,
      latencyMs: params.latencyMs,
      decision: params.decision,
      retrievalScore: params.retrievalScore ?? null,
    })
  }
}
