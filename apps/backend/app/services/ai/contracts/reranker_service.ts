export interface RerankerCandidate {
  id: string
  content: string
  vectorScore: number
  metadata?: Record<string, unknown>
}

export interface RerankResult {
  id: string
  content: string
  rerankScore: number
  originalVectorScore: number
  metadata?: Record<string, unknown>
}

export interface RerankerService {
  rerank(query: string, candidates: RerankerCandidate[], topN: number): Promise<RerankResult[]>
}
