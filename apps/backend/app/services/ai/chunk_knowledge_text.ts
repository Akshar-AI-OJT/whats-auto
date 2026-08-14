import { TokenTextSplitter } from '@langchain/textsplitters'
import { sha256Hex } from '#services/ai/knowledge_hash'

export const KNOWLEDGE_CHUNK_TOKENS = 500
export const KNOWLEDGE_CHUNK_OVERLAP_TOKENS = 50

export type KnowledgeTextChunk = {
  chunkIndex: number
  content: string
  contentHash: string
}

export async function chunkKnowledgeText(text: string): Promise<KnowledgeTextChunk[]> {
  const splitter = new TokenTextSplitter({
    encodingName: 'cl100k_base',
    chunkSize: KNOWLEDGE_CHUNK_TOKENS,
    chunkOverlap: KNOWLEDGE_CHUNK_OVERLAP_TOKENS,
  })
  const parts = await splitter.splitText(text)
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((content, chunkIndex) => ({
      chunkIndex,
      content,
      contentHash: sha256Hex(content),
    }))
}
