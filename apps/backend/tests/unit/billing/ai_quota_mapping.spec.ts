import { test } from '@japa/runner'
import { transformPlanLimits } from '#transformers/plan_transformer'

test.group('AiQuota plan limits', () => {
  test('aiRepliesPerMonth is used as the customer quota', ({ assert }) => {
    const limits = transformPlanLimits({
      limits: { aiRepliesPerMonth: 100 },
    })
    assert.equal(limits.aiRepliesPerMonth, 100)
  })

  test('legacy starter/pro token budgets map to reply quotas at read time', ({ assert }) => {
    assert.equal(
      transformPlanLimits({ limits: { aiTokensPerMonth: 25_000 } }).aiRepliesPerMonth,
      100
    )
    assert.equal(
      transformPlanLimits({ limits: { aiTokensPerMonth: 250_000 } }).aiRepliesPerMonth,
      1000
    )
  })

  test('unknown legacy token budgets do not invent a reply quota', ({ assert }) => {
    assert.isNull(transformPlanLimits({ limits: { aiTokensPerMonth: 12_345 } }).aiRepliesPerMonth)
  })
})
