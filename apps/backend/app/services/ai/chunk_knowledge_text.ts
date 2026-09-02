import { TokenTextSplitter } from '@langchain/textsplitters'
import { sha256Hex } from '#services/ai/knowledge_hash'
import { sanitizeKnowledgeText } from '#services/ai/extract_knowledge_text'

export const KNOWLEDGE_CHUNK_TOKENS = 500
export const KNOWLEDGE_CHUNK_OVERLAP_TOKENS = 50

export type KnowledgeTextChunk = {
  chunkIndex: number
  content: string
  contentHash: string
}

export async function chunkKnowledgeText(text: string): Promise<KnowledgeTextChunk[]> {
  const cleaned = sanitizeKnowledgeText(text)
  if (!cleaned) return []

  const splitter = new TokenTextSplitter({
    encodingName: 'cl100k_base',
    chunkSize: KNOWLEDGE_CHUNK_TOKENS,
    chunkOverlap: KNOWLEDGE_CHUNK_OVERLAP_TOKENS,
  })
  const parts = await splitter.splitText(cleaned)
  return parts
    .map((part) => sanitizeKnowledgeText(part))
    .filter((part) => part.length > 0)
    .map((content, chunkIndex) => ({
      chunkIndex,
      content,
      contentHash: sha256Hex(content),
    }))
}
