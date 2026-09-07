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

  test('pending_setup routes to connect_whatsapp', ({ assert }) => {
    assert.equal(
      resolveNextStep({
        organizationCount: 1,
        activeOrganizationId: 'org-1',
        activeOrgStatus: 'pending_setup',
      }),
      'connect_whatsapp'
    )
  })

  test('verified_setup routes to complete_payment', ({ assert }) => {
    assert.equal(
      resolveNextStep({
        organizationCount: 1,
        activeOrganizationId: 'org-1',
        activeOrgStatus: 'verified_setup',
      }),
      'complete_payment'
    )
  })

  test('active incomplete profile routes to complete_profile', ({ assert }) => {
    assert.equal(
      resolveNextStep({
        organizationCount: 1,
        activeOrganizationId: 'org-1',
        activeOrgStatus: 'active',
        profileComplete: false,
      }),
      'complete_profile'
    )
  })

  test('active complete organization routes to ready', ({ assert }) => {
    assert.equal(
      resolveNextStep({
        organizationCount: 1,
        activeOrganizationId: 'org-1',
        activeOrgStatus: 'active',
        profileComplete: true,
      }),
      'ready'
    )
  })
})
