import { test } from '@japa/runner'
import {
  CREATE_PLACEHOLDER_ADDRESS,
  CREATE_PLACEHOLDER_PAN,
  calculateOrganizationProfileCompletion,
  isOrganizationRequiredProfileComplete,
} from '#lib/organization_profile_completion'

const completeSource = {
  name: 'Acme',
  email: 'ops@acme.com',
  industry: 'Retail',
  businessSize: '11-50',
  pan: 'AAAAA0000A',
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

  test('profileCompleted is false when PAN is missing', ({ assert }) => {
    const missingPan = calculateOrganizationProfileCompletion({
      ...completeSource,
      pan: '  ',
    })
    assert.isFalse(missingPan.profileCompleted)
    assert.deepEqual(missingPan.missingRequired, ['pan'])

    const nullPan = calculateOrganizationProfileCompletion({
      ...completeSource,
      pan: null,
    })
    assert.isFalse(nullPan.profileCompleted)
    assert.include(nullPan.missingRequired, 'pan')
  })

  test('profileCompleted is true when PAN is a real (non-placeholder) value', ({ assert }) => {
    const result = calculateOrganizationProfileCompletion({
      ...completeSource,
      pan: 'aaAaa0000a',
    })
    assert.isTrue(result.profileCompleted)
    assert.notInclude(result.missingRequired, 'pan')
  })

  test('placeholder PAN SETUP0000A does not complete the profile', ({ assert }) => {
    const result = calculateOrganizationProfileCompletion({
      ...completeSource,
      pan: CREATE_PLACEHOLDER_PAN,
    })
    assert.isFalse(result.profileCompleted)
    assert.deepEqual(result.missingRequired, ['pan'])
    assert.isFalse(
      isOrganizationRequiredProfileComplete({
        ...completeSource,
        pan: ' setup0000a ',
      })
    )
  })

  test('placeholder address Address pending does not complete the profile', ({ assert }) => {
    const result = calculateOrganizationProfileCompletion({
      ...completeSource,
      address: {
        ...completeSource.address,
        addressLine1: CREATE_PLACEHOLDER_ADDRESS,
      },
    })
    assert.isFalse(result.profileCompleted)
    assert.deepEqual(result.missingRequired, ['addressLine1'])
  })

  test('legacy free-text placeholder address does not satisfy addressLine1', ({ assert }) => {
    const result = calculateOrganizationProfileCompletion({
      ...completeSource,
      address: CREATE_PLACEHOLDER_ADDRESS,
    })
    assert.isFalse(result.profileCompleted)
    assert.include(result.missingRequired, 'addressLine1')
    assert.includeMembers(result.missingRequired, ['city', 'state', 'postalCode'])
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

  test('profileCompleted is false when other required fields are missing', ({ assert }) => {
    const missingName = calculateOrganizationProfileCompletion({
      ...completeSource,
      name: '',
    })
    assert.isFalse(missingName.profileCompleted)
    assert.include(missingName.missingRequired, 'name')

    const missingEmail = calculateOrganizationProfileCompletion({
      ...completeSource,
      email: null,
    })
    assert.isFalse(missingEmail.profileCompleted)
    assert.include(missingEmail.missingRequired, 'email')

    const missingCountry = calculateOrganizationProfileCompletion({
      ...completeSource,
      country: ' ',
    })
    assert.isFalse(missingCountry.profileCompleted)
    assert.include(missingCountry.missingRequired, 'country')
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
