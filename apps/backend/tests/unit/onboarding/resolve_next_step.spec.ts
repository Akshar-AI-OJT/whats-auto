import { test } from '@japa/runner'
import { resolveNextStep } from '#services/onboarding_service'

test.group('resolveNextStep', () => {
  test('user with no organization creates one', ({ assert }) => {
    assert.equal(
      resolveNextStep({
        organizationCount: 0,
        activeOrganizationId: null,
      }),
      'create_organization'
    )
  })

  test('member without an active organization picks one', ({ assert }) => {
    assert.equal(
      resolveNextStep({
        organizationCount: 2,
        activeOrganizationId: null,
      }),
      'select_organization'
    )
  })

  test('pending_setup active organization must complete payment', ({ assert }) => {
    assert.equal(
      resolveNextStep({
        organizationCount: 1,
        activeOrganizationId: 'org-1',
        activeOrgStatus: 'pending_setup',
      }),
      'complete_payment'
    )
  })

  test('active organization routes to ready', ({ assert }) => {
    assert.equal(
      resolveNextStep({
        organizationCount: 1,
        activeOrganizationId: 'org-1',
        activeOrgStatus: 'active',
      }),
      'ready'
    )
  })
})
