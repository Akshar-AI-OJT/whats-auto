import { test } from '@japa/runner'
import { assertListEnvelope } from '#tests/helpers/list_envelope'

test.group('assertListEnvelope', () => {
  test('accepts { data: T[], meta }', ({ assert }) => {
    assertListEnvelope(assert, {
      data: [{ id: '1' }],
      meta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 },
    }, { paginated: true })
  })

  test('accepts { data: T[] } without requiring meta', ({ assert }) => {
    assertListEnvelope(assert, { data: [{ id: '1' }] })
  })

  test('rejects a nested { data: { data, meta } } envelope', ({ assert }) => {
    assert.throws(() =>
      assertListEnvelope(assert, {
        data: {
          data: [{ id: '1' }],
          meta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 },
        },
      })
    )
  })

  test('rejects a raw array body', ({ assert }) => {
    assert.throws(() => assertListEnvelope(assert, [{ id: '1' }]))
  })

  test('rejects missing pagination meta when paginated', ({ assert }) => {
    assert.throws(() => assertListEnvelope(assert, { data: [] }, { paginated: true }))
  })
})
