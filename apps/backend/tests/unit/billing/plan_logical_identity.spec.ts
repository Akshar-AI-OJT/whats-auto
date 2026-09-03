import { test } from '@japa/runner'
import {
  billingPeriodToInterval,
  deduplicateActivePlanRows,
  normalizeBillingInterval,
  pickCanonicalPlanRow,
  planLogicalIdentityKey,
} from '#lib/billing/plan_logical_identity'

function row(overrides: {
  id: string
  name?: string
  billingInterval?: string
  billingIntervalCount?: number
  price?: number
  currency?: string
  createdAt?: string
}) {
  return {
    name: 'Growth',
    billingInterval: 'month',
    billingIntervalCount: 1,
    price: 2499,
    currency: 'INR',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

test.group('plan logical identity', () => {
  test('monthly and yearly are distinct identities', ({ assert }) => {
    const monthly = row({ id: 'a', billingInterval: 'month' })
    const yearly = row({ id: 'b', billingInterval: 'year' })
    assert.notEqual(planLogicalIdentityKey(monthly), planLogicalIdentityKey(yearly))
    assert.equal(normalizeBillingInterval('monthly'), 'month')
    assert.equal(billingPeriodToInterval('yearly'), 'year')
  })

  test('different currencies and prices are distinct identities', ({ assert }) => {
    const inr = row({ id: 'a', currency: 'INR', price: 2499 })
    const usd = row({ id: 'b', currency: 'USD', price: 2499 })
    const cheaper = row({ id: 'c', currency: 'INR', price: 1999 })
    assert.notEqual(planLogicalIdentityKey(inr), planLogicalIdentityKey(usd))
    assert.notEqual(planLogicalIdentityKey(inr), planLogicalIdentityKey(cheaper))
  })

  test('name is matched case-insensitively and trimmed', ({ assert }) => {
    const left = row({ id: 'a', name: ' Growth ' })
    const right = row({ id: 'b', name: 'growth' })
    assert.equal(planLogicalIdentityKey(left), planLogicalIdentityKey(right))
  })

  test('deduplicate keeps one canonical row and preserves order', ({ assert }) => {
    const older = row({
      id: '11111111-1111-1111-1111-111111111111',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const newer = row({
      id: '22222222-2222-2222-2222-222222222222',
      createdAt: '2026-06-01T00:00:00.000Z',
    })
    const yearly = row({
      id: '33333333-3333-3333-3333-333333333333',
      billingInterval: 'year',
      price: 24990,
      createdAt: '2026-03-01T00:00:00.000Z',
    })

    const unique = deduplicateActivePlanRows([newer, yearly, older])
    assert.deepEqual(
      unique.map((item) => item.id),
      [yearly.id, older.id]
    )
  })

  test('canonical prefers the plan with more subscription references', ({ assert }) => {
    const unused = row({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const used = row({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      createdAt: '2026-06-01T00:00:00.000Z',
    })
    const canonical = pickCanonicalPlanRow([unused, used], new Map([
      [unused.id, { subscriptionCount: 0, orderCount: 0, invoiceCount: 0 }],
      [used.id, { subscriptionCount: 3, orderCount: 1, invoiceCount: 2 }],
    ]))
    assert.equal(canonical.id, used.id)
  })

  test('billing UI would render one card per unique logical plan', ({ assert }) => {
    const cards = deduplicateActivePlanRows([
      row({ id: 'dup-1', createdAt: '2026-01-01T00:00:00.000Z' }),
      row({ id: 'dup-2', createdAt: '2026-02-01T00:00:00.000Z' }),
      row({ id: 'year-1', billingInterval: 'year', price: 24990 }),
    ]).map((plan) => ({
      id: plan.id,
      name: plan.name,
      price: plan.price,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
    }))

    assert.lengthOf(cards, 2)
    assert.equal(new Set(cards.map((card) => card.id)).size, 2)
    assert.equal(
      new Set(cards.map((card) => `${card.name}|${card.billingInterval}|${card.price}|${card.currency}`))
        .size,
      2
    )
  })
})
