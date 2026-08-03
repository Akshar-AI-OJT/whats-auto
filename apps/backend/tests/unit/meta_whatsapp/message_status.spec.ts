import { test } from '@japa/runner'
import { shouldApplyProviderStatus } from '#lib/meta_whatsapp/message_status'

test.group('shouldApplyProviderStatus', () => {
  const t1 = new Date('2024-01-01T00:00:00.000Z')
  const t2 = new Date('2024-01-01T00:01:00.000Z')
  const t0 = new Date('2023-12-31T23:59:00.000Z')

  test('allows forward progress sent → delivered → read', ({ assert }) => {
    assert.isTrue(
      shouldApplyProviderStatus({
        currentStatus: 'sent',
        incomingStatus: 'delivered',
        currentProviderStatusAt: t1,
        incomingProviderStatusAt: t2,
      })
    )
    assert.isTrue(
      shouldApplyProviderStatus({
        currentStatus: 'delivered',
        incomingStatus: 'read',
        currentProviderStatusAt: t1,
        incomingProviderStatusAt: t2,
      })
    )
  })

  test('rejects backward status transitions', ({ assert }) => {
    assert.isFalse(
      shouldApplyProviderStatus({
        currentStatus: 'read',
        incomingStatus: 'delivered',
        currentProviderStatusAt: t2,
        incomingProviderStatusAt: t1,
      })
    )
  })

  test('rejects older provider timestamps even for same or higher rank', ({ assert }) => {
    assert.isFalse(
      shouldApplyProviderStatus({
        currentStatus: 'delivered',
        incomingStatus: 'delivered',
        currentProviderStatusAt: t2,
        incomingProviderStatusAt: t0,
      })
    )
  })

  test('applies failed when timestamp is newer', ({ assert }) => {
    assert.isTrue(
      shouldApplyProviderStatus({
        currentStatus: 'sent',
        incomingStatus: 'failed',
        currentProviderStatusAt: t1,
        incomingProviderStatusAt: t2,
      })
    )
    assert.isFalse(
      shouldApplyProviderStatus({
        currentStatus: 'sent',
        incomingStatus: 'failed',
        currentProviderStatusAt: t2,
        incomingProviderStatusAt: t0,
      })
    )
  })
})
