export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1024
export const DEFAULT_EMBEDDING_SPACE_ID = 'openai:text-embedding-3-small:1024:v1'

export function buildEmbeddingSpaceId(provider: string, model: string): string {
  return `${provider}:${model}:${KNOWLEDGE_EMBEDDING_DIMENSIONS}:v1`
}

export function assertEmbeddingDimensions(values: number[]): void {
  if (values.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding must have ${KNOWLEDGE_EMBEDDING_DIMENSIONS} dimensions, got ${values.length}`
    )
  }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Embedding contains a non-finite value')
  }
}
