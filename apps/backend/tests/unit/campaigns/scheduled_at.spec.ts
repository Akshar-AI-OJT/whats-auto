import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  parseUtcScheduledAt,
  toUtcIso,
  isScheduledAtInput,
  isValidIanaTimeZone,
  InvalidScheduledAtError,
} from '#lib/scheduled_at'

test.group('parseUtcScheduledAt', () => {
  test('accepts a UTC Z instant and returns the same instant', ({ assert }) => {
    const instant = parseUtcScheduledAt('2026-09-08T16:00:00.000Z')
    assert.equal(instant.toISOString(), '2026-09-08T16:00:00.000Z')
  })

  test('accepts Z without milliseconds', ({ assert }) => {
    const instant = parseUtcScheduledAt('2026-09-08T16:00:00Z')
    assert.equal(instant.toISOString(), '2026-09-08T16:00:00.000Z')
  })

  test('rejects naive local wall-clock strings', ({ assert }) => {
    assert.throws(() => parseUtcScheduledAt('2026-09-08 16:00:00'), InvalidScheduledAtError)
    assert.throws(() => parseUtcScheduledAt('2026-09-08T16:00'), InvalidScheduledAtError)
  })

  test('rejects numeric offsets including +00:00', ({ assert }) => {
    assert.throws(() => parseUtcScheduledAt('2026-09-08T16:00:00+00:00'), InvalidScheduledAtError)
    assert.throws(() => parseUtcScheduledAt('2026-09-08T21:30:00+05:30'), InvalidScheduledAtError)
  })

  test('treats Date and DateTime inputs as absolute instants', ({ assert }) => {
    const date = new Date('2026-09-08T16:00:00.000Z')
    assert.equal(parseUtcScheduledAt(date).toISOString(), '2026-09-08T16:00:00.000Z')

    const dt = DateTime.fromISO('2026-09-08T16:00:00.000Z', { zone: 'utc' })
    assert.equal(parseUtcScheduledAt(dt).toISOString(), '2026-09-08T16:00:00.000Z')
  })

  test('isScheduledAtInput mirrors parseUtcScheduledAt acceptance', ({ assert }) => {
    assert.isTrue(isScheduledAtInput('2026-09-08T16:00:00.000Z'))
    assert.isFalse(isScheduledAtInput('2026-09-08T16:00:00+05:30'))
    assert.isFalse(isScheduledAtInput('2026-09-08 16:00:00'))
  })

  test('isValidIanaTimeZone still validates IANA names for non-campaign features', ({ assert }) => {
    assert.isTrue(isValidIanaTimeZone('Asia/Kolkata'))
    assert.isTrue(isValidIanaTimeZone('UTC'))
    assert.isFalse(isValidIanaTimeZone('Not/AZone'))
  })
})

test.group('toUtcIso', () => {
  test('serializes Date instants as UTC ISO', ({ assert }) => {
    assert.equal(toUtcIso(new Date('2026-09-08T16:00:00.000Z')), '2026-09-08T16:00:00.000Z')
  })

  test('serializes Z strings via parseUtcScheduledAt', ({ assert }) => {
    assert.equal(toUtcIso('2026-09-08T16:00:00.000Z'), '2026-09-08T16:00:00.000Z')
  })

  test('treats naive timestamptz text as UTC wall clock for DB serialization', ({ assert }) => {
    assert.equal(toUtcIso('2026-09-08 16:00:00'), '2026-09-08T16:00:00.000Z')
  })
})
