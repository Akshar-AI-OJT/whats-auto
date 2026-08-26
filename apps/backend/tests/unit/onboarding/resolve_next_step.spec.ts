import { test } from '@japa/runner'
import { resolveNextStep } from '#services/onboarding_service'

test.group('resolveNextStep', () => {
  test('invitee with no organization is sent to the invitation screen', ({ assert }) => {
    assert.equal(
      resolveNextStep({
        organizationCount: 0,
        pendingInvitationCount: 1,
        activeOrganizationId: null,
      }),
      'accept_invitation'
    )
  })

  test('user with no organization and no invitation creates one', ({ assert }) => {
    assert.equal(
      resolveNextStep({
        organizationCount: 0,
        pendingInvitationCount: 0,
        activeOrganizationId: null,
      }),
      'create_organization'
    )
  })

  test('existing member with a pending invitation still lands in their workspace', ({ assert }) => {
    assert.equal(
      resolveNextStep({
        organizationCount: 1,
        pendingInvitationCount: 1,
        activeOrganizationId: 'org-1',
      }),
      'ready'
    )
  })

  test('member without an active organization picks one', ({ assert }) => {
    assert.equal(
      resolveNextStep({
        organizationCount: 2,
        pendingInvitationCount: 0,
        activeOrganizationId: null,
      }),
      'select_organization'
    )
  })

  test('pending_setup active organization must complete payment', ({ assert }) => {
    assert.equal(
      resolveNextStep({
        organizationCount: 1,
        pendingInvitationCount: 0,
        activeOrganizationId: 'org-1',
        activeOrgStatus: 'pending_setup',
      }),
      'complete_payment'
    )
  })
})
