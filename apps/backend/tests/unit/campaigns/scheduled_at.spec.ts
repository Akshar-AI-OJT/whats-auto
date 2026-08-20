import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { parseScheduledAt, toUtcIso } from '#lib/scheduled_at'

test.group('parseScheduledAt', () => {
  test('interprets naive 10:55 PM as organization-local, not UTC', ({ assert }) => {
    const instant = parseScheduledAt('2099-08-19 22:55:00', 'Asia/Kolkata')
    assert.equal(instant.toISOString(), '2099-08-19T17:25:00.000Z')

    const local = DateTime.fromJSDate(instant, { zone: 'Asia/Kolkata' })
    assert.equal(local.toFormat('hh:mm a'), '10:55 PM')
    assert.equal(local.toISODate(), '2099-08-19')
  })

  test('accepts datetime-local naive values without converting twice', ({ assert }) => {
    const instant = parseScheduledAt('2099-08-19T22:55', 'Asia/Kolkata')
    assert.equal(instant.toISOString(), '2099-08-19T17:25:00.000Z')
  })

  test('keeps timezone-aware ISO instants without converting again', ({ assert }) => {
    const instant = parseScheduledAt('2099-08-19T17:25:00.000Z', 'Asia/Kolkata')
    assert.equal(instant.toISOString(), '2099-08-19T17:25:00.000Z')
  })

  test('keeps numeric-offset ISO instants', ({ assert }) => {
    const instant = parseScheduledAt('2099-08-19T22:55:00+05:30', 'UTC')
    assert.equal(instant.toISOString(), '2099-08-19T17:25:00.000Z')
  })

  test('preserves a morning wall-clock time in a non-UTC organization timezone', ({ assert }) => {
    const instant = parseScheduledAt('2099-08-19 08:30:00', 'Asia/Kolkata')
    assert.equal(instant.toISOString(), '2099-08-19T03:00:00.000Z')

    const local = DateTime.fromJSDate(instant, { zone: 'Asia/Kolkata' })
    assert.equal(local.toFormat('hh:mm a'), '08:30 AM')
  })

  test('does not shift the local calendar date across midnight', ({ assert }) => {
    const instant = parseScheduledAt('2099-08-20 00:30:00', 'Asia/Kolkata')
    assert.equal(instant.toISOString(), '2099-08-19T19:00:00.000Z')

    const local = DateTime.fromJSDate(instant, { zone: 'Asia/Kolkata' })
    assert.equal(local.toISODate(), '2099-08-20')
    assert.equal(local.toFormat('HH:mm'), '00:30')
  })

  test('interprets naive time in America/New_York during EDT', ({ assert }) => {
    const instant = parseScheduledAt('2099-08-19 22:55:00', 'America/New_York')
    assert.equal(instant.toISOString(), '2099-08-20T02:55:00.000Z')

    const local = DateTime.fromJSDate(instant, { zone: 'America/New_York' })
    assert.equal(local.toFormat('hh:mm a'), '10:55 PM')
    assert.equal(local.toISODate(), '2099-08-19')
  })

  test('treats Date and DateTime inputs as absolute instants', ({ assert }) => {
    const date = new Date('2099-08-19T17:25:00.000Z')
    assert.equal(parseScheduledAt(date, 'Asia/Kolkata').toISOString(), '2099-08-19T17:25:00.000Z')

    const dt = DateTime.fromISO('2099-08-19T17:25:00.000Z', { zone: 'utc' })
    assert.equal(parseScheduledAt(dt, 'Asia/Kolkata').toISOString(), '2099-08-19T17:25:00.000Z')
  })

  test('UTC organization timezone keeps naive wall clock as UTC', ({ assert }) => {
    const instant = parseScheduledAt('2099-08-19 22:55:00', 'UTC')
    assert.equal(instant.toISOString(), '2099-08-19T22:55:00.000Z')
  })
})

test.group('toUtcIso', () => {
  test('serializes Date instants as UTC ISO', ({ assert }) => {
    assert.equal(toUtcIso(new Date('2099-08-19T17:25:00.000Z')), '2099-08-19T17:25:00.000Z')
  })

  test('treats naive timestamptz text as UTC wall clock, not process local', ({ assert }) => {
    assert.equal(toUtcIso('2099-08-19 17:25:00'), '2099-08-19T17:25:00.000Z')
  })

  test('keeps timezone-aware ISO strings', ({ assert }) => {
    assert.equal(toUtcIso('2099-08-19T22:55:00+05:30'), '2099-08-19T17:25:00.000Z')
  })
})
