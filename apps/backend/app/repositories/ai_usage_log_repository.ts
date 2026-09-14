import db from '@adonisjs/lucid/services/db'
import type { AiUsageDecision, AiOperationType } from '#enums/ai_usage_decision'
import { estimateCostUsd } from '#services/ai/llm_pricing'

export type InsertAiUsageLogParams = {
  organizationId: string
  conversationId: string | null
  messageId?: string | null
  provider: string
  operationType: AiOperationType
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
    const promptTokens = params.promptTokens ?? 0
    const completionTokens = params.completionTokens ?? 0
    const estimatedCostUsd =
      params.estimatedCostUsd ??
      estimateCostUsd(params.provider, params.modelName, promptTokens, completionTokens)

    await db.table('ai_usage_logs').insert({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      messageId: params.messageId ?? null,
      provider: params.provider,
      operationType: params.operationType,
      promptTokens,
      completionTokens,
      totalTokens: params.totalTokens ?? promptTokens + completionTokens,
      estimatedCostUsd,
      modelName: params.modelName,
      latencyMs: params.latencyMs,
      decision: params.decision,
      retrievalScore: params.retrievalScore ?? null,
    })
  }
}
