import { test } from '@japa/runner'
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  toVectorLiteral,
} from '#repositories/ai_knowledge_chunk_repository'

test.group('toVectorLiteral', () => {
  test('formats a 1024-d vector for pgvector', ({ assert }) => {
    const values = Array.from({ length: KNOWLEDGE_EMBEDDING_DIMENSIONS }, (_, i) => i * 0.001)
    const literal = toVectorLiteral(values)
    assert.isTrue(literal.startsWith('['))
    assert.isTrue(literal.endsWith(']'))
    assert.equal(literal.split(',').length, KNOWLEDGE_EMBEDDING_DIMENSIONS)
  })

  test('rejects the wrong dimension', ({ assert }) => {
    assert.throws(() => toVectorLiteral([1, 2]), /1024/)
  })
})
