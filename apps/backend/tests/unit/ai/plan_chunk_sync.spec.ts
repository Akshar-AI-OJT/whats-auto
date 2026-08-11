import { test } from '@japa/runner'
import { planChunkSync } from '#services/ai/plan_chunk_sync'

test.group('planChunkSync', () => {
  test('embeds only new hashes and deletes removed ones', ({ assert }) => {
    const plan = planChunkSync(
      [
        { id: 'keep', contentHash: 'aaa' },
        { id: 'gone', contentHash: 'bbb' },
      ],
      [
        { chunkIndex: 0, content: 'A', contentHash: 'aaa' },
        { chunkIndex: 1, content: 'C', contentHash: 'ccc' },
      ]
    )

    assert.deepEqual(plan.unchanged, [{ existingId: 'keep', chunkIndex: 0 }])
    assert.deepEqual(plan.toInsert, [{ chunkIndex: 1, content: 'C', contentHash: 'ccc' }])
    assert.deepEqual(plan.toDeleteIds, ['gone'])
  })

  test('treats duplicate hashes as a multiset', ({ assert }) => {
    const plan = planChunkSync(
      [
        { id: 'one', contentHash: 'same' },
        { id: 'two', contentHash: 'same' },
      ],
      [
        { chunkIndex: 0, content: 'x', contentHash: 'same' },
        { chunkIndex: 1, content: 'x', contentHash: 'same' },
        { chunkIndex: 2, content: 'y', contentHash: 'other' },
      ]
    )

    assert.lengthOf(plan.unchanged, 2)
    assert.lengthOf(plan.toInsert, 1)
    assert.lengthOf(plan.toDeleteIds, 0)
  })

  test('first ingest inserts every chunk', ({ assert }) => {
    const plan = planChunkSync([], [{ chunkIndex: 0, content: 'hello', contentHash: 'h' }])
    assert.lengthOf(plan.toInsert, 1)
    assert.lengthOf(plan.unchanged, 0)
    assert.lengthOf(plan.toDeleteIds, 0)
  })
})
