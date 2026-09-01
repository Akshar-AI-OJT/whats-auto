import { test } from '@japa/runner'
import {
  chunkKnowledgeText,
  KNOWLEDGE_CHUNK_OVERLAP_TOKENS,
  KNOWLEDGE_CHUNK_TOKENS,
} from '#services/ai/chunk_knowledge_text'
import { sha256Hex } from '#services/ai/knowledge_hash'

test.group('chunkKnowledgeText', (group) => {
  // TokenTextSplitter loads cl100k_base on first use; unit suite default is 2s.
  group.tap((t) => t.timeout(15_000))

  test('hashes each chunk and keeps a short note as one chunk', async ({ assert }) => {
    const chunks = await chunkKnowledgeText('Open 9-5 Monday to Friday.')
    assert.lengthOf(chunks, 1)
    assert.equal(chunks[0]!.chunkIndex, 0)
    assert.equal(chunks[0]!.contentHash, sha256Hex(chunks[0]!.content))
    assert.equal(KNOWLEDGE_CHUNK_TOKENS, 500)
    assert.equal(KNOWLEDGE_CHUNK_OVERLAP_TOKENS, 50)
  })

  test('splits a long document into overlapping token windows', async ({ assert }) => {
    const words = Array.from({ length: 800 }, (_, i) => `word${i}`).join(' ')
    const chunks = await chunkKnowledgeText(words)
    assert.isAbove(chunks.length, 1)
    assert.equal(chunks[1]!.chunkIndex, 1)
    assert.notEqual(chunks[0]!.contentHash, chunks[1]!.contentHash)
  })

  test('strips null bytes before hashing chunks', async ({ assert }) => {
    const chunks = await chunkKnowledgeText('Open\u0000 9-5\u0000 Monday')
    assert.lengthOf(chunks, 1)
    assert.equal(chunks[0]!.content, 'Open 9-5 Monday')
    assert.equal(chunks[0]!.contentHash, sha256Hex('Open 9-5 Monday'))
    assert.notInclude(chunks[0]!.content, '\u0000')
  })
})
