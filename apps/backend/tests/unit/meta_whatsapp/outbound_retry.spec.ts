import { test } from '@japa/runner'
import { MetaGraphApiError } from '#lib/meta_whatsapp/graph_client'
import {
  isRetryableOutboundError,
  isTerminalOutboundFailure,
  nextAttemptAt,
  OUTBOUND_MAX_ATTEMPTS,
  retryDelayMinutes,
} from '#lib/meta_whatsapp/outbound_retry'

test.group('outbound_retry', () => {
  test('retry delays follow 1,2,4,8,16 minutes', ({ assert }) => {
    assert.equal(retryDelayMinutes(1), 1)
    assert.equal(retryDelayMinutes(2), 2)
    assert.equal(retryDelayMinutes(3), 4)
    assert.equal(retryDelayMinutes(4), 8)
    assert.equal(retryDelayMinutes(5), 16)
    assert.equal(retryDelayMinutes(99), 16)
  })

  test('retryable HTTP statuses and network errors', ({ assert }) => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      assert.isTrue(
        isRetryableOutboundError(new MetaGraphApiError('tmp', status, null, 'sendText'))
      )
    }

    assert.isFalse(
      isRetryableOutboundError(new MetaGraphApiError('bad template', 400, null, 'sendTemplate'))
    )
    assert.isTrue(isRetryableOutboundError(new TypeError('fetch failed')))
    assert.isTrue(
      isRetryableOutboundError(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
    )
  })

  test('fifth retryable failure is terminal', ({ assert }) => {
    assert.equal(OUTBOUND_MAX_ATTEMPTS, 5)
    assert.isFalse(isTerminalOutboundFailure({ attempts: 4, retryable: true }))
    assert.isTrue(isTerminalOutboundFailure({ attempts: 5, retryable: true }))
    assert.isTrue(isTerminalOutboundFailure({ attempts: 1, retryable: false }))
  })

  test('nextAttemptAt adds delay minutes', ({ assert }) => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    assert.equal(nextAttemptAt(from, 1).toISOString(), '2026-01-01T00:01:00.000Z')
    assert.equal(nextAttemptAt(from, 3).toISOString(), '2026-01-01T00:04:00.000Z')
  })
})
