import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { computeOrderPeriod } from '#services/billing/billing_period'

test.group('computeOrderPeriod', () => {
  test('new subscription starts now and uses interval count', ({ assert }) => {
    const now = DateTime.fromISO('2026-01-15T12:00:00.000Z', { zone: 'utc' })
    const { periodStart, periodEnd } = computeOrderPeriod({
      purpose: 'new_subscription',
      billingInterval: 'month',
      billingIntervalCount: 3,
      now,
    })
    assert.equal(periodStart.toISO(), now.toISO())
    assert.equal(periodEnd.toISO(), now.plus({ months: 3 }).toISO())
  })

  test('renewal starts at unused currentPeriodEnd', ({ assert }) => {
    const now = DateTime.fromISO('2026-01-15T12:00:00.000Z', { zone: 'utc' })
    const existingEnd = now.plus({ days: 10 })
    const { periodStart, periodEnd } = computeOrderPeriod({
      purpose: 'renewal',
      billingInterval: 'year',
      billingIntervalCount: 1,
      now,
      existingPeriodEnd: existingEnd,
    })
    assert.equal(periodStart.toISO(), existingEnd.toISO())
    assert.equal(periodEnd.toISO(), existingEnd.plus({ years: 1 }).toISO())
  })

  test('late renewal starts now when the previous period already ended', ({ assert }) => {
    const now = DateTime.fromISO('2026-01-15T12:00:00.000Z', { zone: 'utc' })
    const existingEnd = now.minus({ days: 2 })
    const { periodStart, periodEnd } = computeOrderPeriod({
      purpose: 'renewal',
      billingInterval: 'month',
      billingIntervalCount: 1,
      now,
      existingPeriodEnd: existingEnd,
    })
    assert.equal(periodStart.toISO(), now.toISO())
    assert.equal(periodEnd.toISO(), now.plus({ months: 1 }).toISO())
  })
})
