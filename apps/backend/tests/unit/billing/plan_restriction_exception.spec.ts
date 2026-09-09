import { test } from '@japa/runner'
import PlanRestrictionException from '#exceptions/plan_restriction_exception'

test.group('PlanRestrictionException', () => {
  test('featureDisabled carries 403 upgrade meta', ({ assert }) => {
    const err = PlanRestrictionException.featureDisabled('flowBuilder', 'professional')
    assert.equal(err.status, 403)
    assert.equal(err.code, 'E_PLAN_RESTRICTION_VIOLATED')
    assert.equal(err.meta.restrictionType, 'feature')
    assert.equal(err.meta.key, 'flowBuilder')
    assert.equal(err.meta.requiredPlan, 'professional')
  })

  test('meteredQuotaExceeded includes current and limit', ({ assert }) => {
    const err = PlanRestrictionException.meteredQuotaExceeded('messages', 100, 100)
    assert.equal(err.meta.restrictionType, 'metered_quota')
    assert.equal(err.meta.current, 100)
    assert.equal(err.meta.limit, 100)
  })
})
