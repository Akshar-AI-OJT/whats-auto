import type {
  RerankerService,
  RerankResult,
  RerankerCandidate,
} from '#services/ai/contracts/reranker_service'

/**
 * Deferred live reranker: sort by vector score and take the top N.
 */
export default class PassthroughRerankerService implements RerankerService {
  async rerank(
    _query: string,
    candidates: RerankerCandidate[],
    topN: number
  ): Promise<RerankResult[]> {
    return [...candidates]
      .sort((a, b) => b.vectorScore - a.vectorScore)
      .slice(0, Math.max(0, topN))
      .map((candidate) => ({
        id: candidate.id,
        content: candidate.content,
        rerankScore: candidate.vectorScore,
        originalVectorScore: candidate.vectorScore,
        metadata: candidate.metadata,
      }))
  }
}
