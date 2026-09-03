import { test } from '@japa/runner'
import {
  calculateOrganizationProfileCompletion,
  isOrganizationRequiredProfileComplete,
} from '#lib/organization_profile_completion'

const completeSource = {
  name: 'Acme',
  email: 'ops@acme.com',
  industry: 'Retail',
  businessSize: '11-50',
  country: 'IN',
  address: {
    addressLine1: '12 MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
  },
}

test.group('Organization profile completion helper', () => {
  test('profileCompleted is true when every required field is filled', ({ assert }) => {
    const result = calculateOrganizationProfileCompletion(completeSource)
    assert.isTrue(result.profileCompleted)
    assert.lengthOf(result.missingRequired, 0)
    assert.isTrue(isOrganizationRequiredProfileComplete(completeSource))
  })

  test('profileCompleted is false when industry or businessSize is missing', ({ assert }) => {
    const missingIndustry = calculateOrganizationProfileCompletion({
      ...completeSource,
      industry: '  ',
    })
    assert.isFalse(missingIndustry.profileCompleted)
    assert.deepEqual(missingIndustry.missingRequired, ['industry'])

    const missingSize = calculateOrganizationProfileCompletion({
      ...completeSource,
      businessSize: null,
    })
    assert.isFalse(missingSize.profileCompleted)
    assert.include(missingSize.missingRequired, 'businessSize')
  })

  test('legacy free-text address does not satisfy city/state/postalCode', ({ assert }) => {
    const result = calculateOrganizationProfileCompletion({
      ...completeSource,
      address: '221B Baker Street, Mumbai',
    })
    assert.isFalse(result.profileCompleted)
    assert.includeMembers(result.missingRequired, ['city', 'state', 'postalCode'])
    assert.notInclude(result.missingRequired, 'addressLine1')
  })

  test('optional fields such as logo do not affect profileCompleted', ({ assert }) => {
    assert.isTrue(
      calculateOrganizationProfileCompletion({
        ...completeSource,
      }).profileCompleted
    )
  })
})
