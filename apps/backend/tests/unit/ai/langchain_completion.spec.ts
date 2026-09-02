import { test } from '@japa/runner'
import {
  assertEmbeddingVectors,
  textFromLangChainContent,
} from '#services/ai/drivers/langchain_completion'
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from '#services/ai/embedding_space'

test.group('langchain completion helpers', () => {
  test('textFromLangChainContent joins string and text parts', ({ assert }) => {
    assert.equal(textFromLangChainContent('hello'), 'hello')
    assert.equal(textFromLangChainContent([{ text: 'Open ' }, { text: '9-5' }]), 'Open 9-5')
  })

  test('assertEmbeddingVectors rejects the wrong dimension', ({ assert }) => {
    assert.throws(() => assertEmbeddingVectors([[0.1, 0.2]]), /1024/)
  })

  test('assertEmbeddingVectors accepts 1024-d rows', ({ assert }) => {
    const row = new Array(KNOWLEDGE_EMBEDDING_DIMENSIONS).fill(0.2)
    assert.deepEqual(assertEmbeddingVectors([row]), [row])
  })
})
