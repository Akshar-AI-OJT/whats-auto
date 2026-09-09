import { test } from '@japa/runner'
import {
  estimateCostUsd,
  estimateEmbeddingCostUsd,
  estimateTokensFromChars,
} from '#services/ai/llm_pricing'

test.group('llm_pricing', () => {
  test('estimateTokensFromChars rounds up by ~4 chars', ({ assert }) => {
    assert.equal(estimateTokensFromChars(0), 0)
    assert.equal(estimateTokensFromChars(1), 1)
    assert.equal(estimateTokensFromChars(4), 1)
    assert.equal(estimateTokensFromChars(5), 2)
  })

  test('estimateCostUsd uses known model rates', ({ assert }) => {
    const cost = estimateCostUsd('openai', 'gpt-4o-mini', 1000, 1000)
    assert.equal(cost, 0.00075)
  })

  test('estimateCostUsd returns 0 for unknown models', ({ assert }) => {
    assert.equal(estimateCostUsd('openai', 'unknown-model', 1000, 1000), 0)
  })

  test('estimateEmbeddingCostUsd ignores completion', ({ assert }) => {
    const cost = estimateEmbeddingCostUsd('openai', 'text-embedding-3-small', 1000)
    assert.equal(cost, 0.00002)
  })
})
