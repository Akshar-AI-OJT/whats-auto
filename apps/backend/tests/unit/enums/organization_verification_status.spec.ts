import { test } from '@japa/runner'
import {
  OrganizationVerificationStatus,
  parseOrganizationVerificationStatus,
} from '#enums/organization_verification_status'

test.group('parseOrganizationVerificationStatus', () => {
  test('narrows known verification statuses', ({ assert }) => {
    assert.equal(
      parseOrganizationVerificationStatus('unverified'),
      OrganizationVerificationStatus.Unverified
    )
    assert.equal(
      parseOrganizationVerificationStatus('pending_review'),
      OrganizationVerificationStatus.PendingReview
    )
    assert.equal(
      parseOrganizationVerificationStatus('verified'),
      OrganizationVerificationStatus.Verified
    )
    assert.equal(
      parseOrganizationVerificationStatus('rejected'),
      OrganizationVerificationStatus.Rejected
    )
  })

  test('maps unknown values to unverified', ({ assert }) => {
    assert.equal(
      parseOrganizationVerificationStatus('nonsense'),
      OrganizationVerificationStatus.Unverified
    )
    assert.equal(
      parseOrganizationVerificationStatus(null),
      OrganizationVerificationStatus.Unverified
    )
    assert.equal(
      parseOrganizationVerificationStatus(undefined),
      OrganizationVerificationStatus.Unverified
    )
  })
})
