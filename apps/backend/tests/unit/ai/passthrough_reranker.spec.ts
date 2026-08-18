import { test } from '@japa/runner'
import PassthroughRerankerService from '#services/ai/drivers/passthrough_reranker_service'
import { JOB_NAMES } from '#services/job_queue/job_names'

test.group('PassthroughRerankerService', () => {
  test('sorts by vector score and slices top N', async ({ assert }) => {
    const reranker = new PassthroughRerankerService()
    const result = await reranker.rerank(
      'hours',
      [
        { id: 'a', content: 'low', vectorScore: 0.2 },
        { id: 'b', content: 'high', vectorScore: 0.9, metadata: { chunkIndex: 1 } },
        { id: 'c', content: 'mid', vectorScore: 0.5 },
      ],
      2
    )

    assert.deepEqual(
      result.map((row) => row.id),
      ['b', 'c']
    )
    assert.equal(result[0].rerankScore, 0.9)
    assert.equal(result[0].originalVectorScore, 0.9)
    assert.deepEqual(result[0].metadata, { chunkIndex: 1 })
  })

  test('registers AI job names', ({ assert }) => {
    assert.equal(JOB_NAMES.AI_PROCESS_DOCUMENT, 'ai.process_document')
    assert.equal(JOB_NAMES.AI_DEBOUNCE_TURN, 'ai.debounce_turn')
    assert.equal(JOB_NAMES.AI_SUMMARIZE_CONVERSATION, 'ai.summarize_conversation')
    assert.equal(JOB_NAMES.AI_REINDEX_ALL_DOCUMENTS, 'ai.reindex_all_documents')
  })
})
