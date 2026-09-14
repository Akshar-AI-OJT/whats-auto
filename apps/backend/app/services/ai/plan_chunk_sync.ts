export type ExistingKnowledgeChunk = {
  id: string
  contentHash: string
}

export type PlannedKnowledgeChunk = {
  chunkIndex: number
  content: string
  contentHash: string
}

export type ChunkSyncPlan = {
  unchanged: Array<{ existingId: string; chunkIndex: number }>
  toInsert: PlannedKnowledgeChunk[]
  toDeleteIds: string[]
}

/**
 * Match chunks by content hash (multiset). Unchanged hashes skip embed.
 * Inserting text at the start usually shifts later window hashes — accepted for v1.
 */
export function planChunkSync(
  existing: ExistingKnowledgeChunk[],
  next: PlannedKnowledgeChunk[]
): ChunkSyncPlan {
  const remaining = [...existing]
  const unchanged: ChunkSyncPlan['unchanged'] = []
  const toInsert: PlannedKnowledgeChunk[] = []

  for (const chunk of next) {
    const index = remaining.findIndex((row) => row.contentHash === chunk.contentHash)
    if (index >= 0) {
      const [found] = remaining.splice(index, 1)
      unchanged.push({ existingId: found.id, chunkIndex: chunk.chunkIndex })
    } else {
      toInsert.push(chunk)
    }
  }

  return {
    unchanged,
    toInsert,
    toDeleteIds: remaining.map((row) => row.id),
  }
}
