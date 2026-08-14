import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { AiKnowledgeChunkRepository } from '#repositories/ai_knowledge_chunk_repository'
import { EmbeddingLlmProvider } from '#services/ai/contracts/llm_provider'
import type { RerankerService } from '#services/ai/contracts/reranker_service'
import PassthroughRerankerService from '#services/ai/drivers/passthrough_reranker_service'
import { DEFAULT_EMBEDDING_SPACE_ID } from '#services/ai/embedding_space'
import PlatformAiConfigService from '#services/ai/platform_ai_config_service'
import { runWithTenant } from '#services/tenant_context'

export const KNOWLEDGE_RETRIEVAL_TOP_K = 10
export const KNOWLEDGE_RETRIEVAL_TOP_N = 5

export type RetrievedKnowledgeChunk = {
  id: string
  documentId: string
  content: string
  score: number
  metadata?: Record<string, unknown>
}

export type RetrievedCampaignContext = {
  id: string
  name: string
  status: string
  scheduledAt: string | null
  finalizedAt: string | null
  messageTemplateId: string | null
}

export type KnowledgeRetrievalResult = {
  chunks: RetrievedKnowledgeChunk[]
  maxScore: number
  minConfidenceScore: number
  meetsMinConfidence: boolean
  campaign: RetrievedCampaignContext | null
}

export default class KnowledgeRetrievalService {
  constructor(
    private chunks: AiKnowledgeChunkRepository = new AiKnowledgeChunkRepository(),
    private llm?: EmbeddingLlmProvider,
    private platform?: PlatformAiConfigService,
    private reranker: RerankerService = new PassthroughRerankerService()
  ) {}

  async retrieve(params: {
    organizationId: string
    query: string
    campaignId?: string | null
    topK?: number
    topN?: number
  }): Promise<KnowledgeRetrievalResult> {
    const config = await this.#platformConfig()
    const empty = this.#empty(config.minConfidenceScore, null)

    const query = params.query.trim()
    if (!query) {
      const campaign = await this.#campaign(params.organizationId, params.campaignId)
      return { ...empty, campaign }
    }

    const llm = await this.#llmProvider()
    const [embedding] = await llm.embedTexts([query], config.embeddingModel)
    if (!embedding) {
      const campaign = await this.#campaign(params.organizationId, params.campaignId)
      return { ...empty, campaign }
    }

    const topK = params.topK ?? KNOWLEDGE_RETRIEVAL_TOP_K
    const topN = params.topN ?? KNOWLEDGE_RETRIEVAL_TOP_N
    const hits = await runWithTenant(params.organizationId, () =>
      this.chunks.searchByEmbedding({
        organizationId: params.organizationId,
        embedding,
        limit: topK,
        embeddingSpaceId: config.activeEmbeddingSpaceId ?? DEFAULT_EMBEDDING_SPACE_ID,
      })
    )

    const reranked = await this.reranker.rerank(
      query,
      hits.map((hit) => ({
        id: hit.id,
        content: hit.content,
        vectorScore: hit.vectorScore,
        metadata: {
          ...(hit.metadata ?? {}),
          documentId: hit.documentId,
          chunkIndex: hit.chunkIndex,
        },
      })),
      topN
    )

    const chunks: RetrievedKnowledgeChunk[] = reranked.map((row) => ({
      id: row.id,
      documentId: String(row.metadata?.documentId ?? ''),
      content: row.content,
      score: row.originalVectorScore,
      metadata: row.metadata,
    }))

    const maxScore = chunks.reduce((max, chunk) => Math.max(max, chunk.score), 0)
    const campaign = await this.#campaign(params.organizationId, params.campaignId)

    return {
      chunks,
      maxScore,
      minConfidenceScore: config.minConfidenceScore,
      meetsMinConfidence: chunks.length > 0 && maxScore >= config.minConfidenceScore,
      campaign,
    }
  }

  #empty(
    minConfidenceScore: number,
    campaign: RetrievedCampaignContext | null
  ): KnowledgeRetrievalResult {
    return {
      chunks: [],
      maxScore: 0,
      minConfidenceScore,
      meetsMinConfidence: false,
      campaign,
    }
  }

  async #campaign(
    organizationId: string,
    campaignId?: string | null
  ): Promise<RetrievedCampaignContext | null> {
    if (!campaignId) return null

    const row = await runWithTenant(organizationId, () =>
      db
        .from('broadcasts')
        .where('id', campaignId)
        .where('organizationId', organizationId)
        .whereNot('status', 'deleted')
        .select('id', 'name', 'status', 'scheduledAt', 'finalizedAt', 'messageTemplateId')
        .first()
    )
    if (!row) return null

    return {
      id: row.id as string,
      name: row.name as string,
      status: row.status as string,
      scheduledAt: toIsoOrNull(row.scheduledAt),
      finalizedAt: toIsoOrNull(row.finalizedAt),
      messageTemplateId: (row.messageTemplateId as string | null) ?? null,
    }
  }

  async #llmProvider(): Promise<EmbeddingLlmProvider> {
    if (this.llm) return this.llm
    return app.container.make(EmbeddingLlmProvider)
  }

  async #platformConfig() {
    const service = this.platform ?? (await app.container.make(PlatformAiConfigService))
    return service.get()
  }
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return new Date(String(value)).toISOString()
}
