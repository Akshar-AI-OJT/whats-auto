import { test } from '@japa/runner'
import {
  DEFAULT_EMBEDDING_SPACE_ID,
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  assertEmbeddingDimensions,
  buildEmbeddingSpaceId,
} from '#services/ai/embedding_space'

test.group('embedding space', () => {
  test('builds a 1024-d space id from provider and model', ({ assert }) => {
    assert.equal(
      buildEmbeddingSpaceId('google', 'gemini-embedding-2'),
      'google:gemini-embedding-2:1024:v1'
    )
    assert.equal(DEFAULT_EMBEDDING_SPACE_ID, 'openai:text-embedding-3-small:1024:v1')
    assert.equal(KNOWLEDGE_EMBEDDING_DIMENSIONS, 1024)
  })

  test('rejects the wrong length or a non-finite value', ({ assert }) => {
    assert.throws(() => assertEmbeddingDimensions([0.1, 0.2]), /1024/)
    assert.throws(
      () => assertEmbeddingDimensions(new Array(KNOWLEDGE_EMBEDDING_DIMENSIONS).fill(Number.NaN)),
      /non-finite/
    )
    assert.doesNotThrow(() =>
      assertEmbeddingDimensions(new Array(KNOWLEDGE_EMBEDDING_DIMENSIONS).fill(0.1))
    )
  })
})
