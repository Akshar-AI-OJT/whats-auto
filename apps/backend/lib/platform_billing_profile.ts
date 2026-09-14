/**
 * Platform invoice “From” block. Persisted on platform_settings (no secrets).
 * Never fall back to fabricated GSTIN / seller identity.
 */

export const BILLING_PROFILE_NOT_CONFIGURED = 'Not configured'

/** Fabricated GSTIN from the retired mock profile — must not appear on live invoices. */
export const RETIRED_MOCK_SELLER_GSTIN = '09AABCW1234D1Z5'

export type PlatformBillingProfile = {
  brandName: string
  legalName: string
  tagline: string
  addressLines: string[]
  gstin: string
  email: string
  phone: string
  website: string
}

export type PlatformBillingSettingsFields = {
  platformName?: string | null
  billingBrandName?: string | null
  billingLegalName?: string | null
  billingTagline?: string | null
  billingAddress?: string | null
  billingGstin?: string | null
  billingEmail?: string | null
  billingPhone?: string | null
  billingWebsite?: string | null
}

export const EMPTY_PLATFORM_BILLING_PROFILE: PlatformBillingProfile = {
  brandName: BILLING_PROFILE_NOT_CONFIGURED,
  legalName: BILLING_PROFILE_NOT_CONFIGURED,
  tagline: '',
  addressLines: [],
  gstin: '',
  email: '',
  phone: '',
  website: '',
}

function blank(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

export function mapPlatformSettingsToBillingProfile(
  settings: PlatformBillingSettingsFields | null | undefined
): PlatformBillingProfile {
  if (!settings) return { ...EMPTY_PLATFORM_BILLING_PROFILE }

  const brandName =
    blank(settings.billingBrandName) ||
    blank(settings.platformName) ||
    BILLING_PROFILE_NOT_CONFIGURED

  return {
    brandName,
    legalName: blank(settings.billingLegalName) || BILLING_PROFILE_NOT_CONFIGURED,
    tagline: blank(settings.billingTagline),
    addressLines: blank(settings.billingAddress)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    gstin: blank(settings.billingGstin),
    email: blank(settings.billingEmail),
    phone: blank(settings.billingPhone),
    website: blank(settings.billingWebsite),
  }
}
