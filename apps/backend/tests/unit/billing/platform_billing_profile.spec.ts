import { test } from '@japa/runner'
import {
  BILLING_PROFILE_NOT_CONFIGURED,
  EMPTY_PLATFORM_BILLING_PROFILE,
  RETIRED_MOCK_SELLER_GSTIN,
  mapPlatformSettingsToBillingProfile,
} from '#lib/platform_billing_profile'

test.group('BUG-022 platform billing profile mapper', () => {
  test('empty settings never emit the retired mock GSTIN', ({ assert }) => {
    const profile = mapPlatformSettingsToBillingProfile({
      platformName: 'WhatsAuto',
      billingBrandName: '',
      billingLegalName: '',
      billingTagline: '',
      billingAddress: '',
      billingGstin: '',
      billingEmail: '',
      billingPhone: '',
      billingWebsite: '',
    })

    assert.equal(profile.legalName, BILLING_PROFILE_NOT_CONFIGURED)
    assert.equal(profile.gstin, '')
    assert.deepEqual(profile.addressLines, [])
    assert.notInclude(JSON.stringify(profile), RETIRED_MOCK_SELLER_GSTIN)
    assert.notEqual(profile.legalName, 'Whats-Auto Technologies Pvt. Ltd.')
  })

  test('null settings use the empty fallback', ({ assert }) => {
    const profile = mapPlatformSettingsToBillingProfile(null)
    assert.deepEqual(profile, EMPTY_PLATFORM_BILLING_PROFILE)
    assert.notInclude(JSON.stringify(profile), RETIRED_MOCK_SELLER_GSTIN)
  })

  test('configured seller identity is mapped including address lines', ({ assert }) => {
    const profile = mapPlatformSettingsToBillingProfile({
      platformName: 'WhatsAuto',
      billingBrandName: 'Acme Billing',
      billingLegalName: 'Acme Billing Pvt Ltd',
      billingTagline: 'Invoices',
      billingAddress: 'Plot 1, Pune\nMaharashtra',
      billingGstin: '27aabcu9603r1zm',
      billingEmail: 'accounts@acme-billing.test',
      billingPhone: '+91 20 1234 5678',
      billingWebsite: 'www.acme-billing.test',
    })

    assert.equal(profile.brandName, 'Acme Billing')
    assert.equal(profile.legalName, 'Acme Billing Pvt Ltd')
    assert.deepEqual(profile.addressLines, ['Plot 1, Pune', 'Maharashtra'])
    assert.equal(profile.gstin, '27aabcu9603r1zm')
    assert.equal(profile.email, 'accounts@acme-billing.test')
  })
})
