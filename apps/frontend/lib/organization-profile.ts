import type { OrganizationAddress, OrganizationSummary } from '@/lib/api'

export const ORG_PROFILE_PATH = '/onboarding/organization-profile'
export const ORGANIZATION_ID_QUERY_PARAM = 'organizationId'

const ORGANIZATION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isOrganizationId(value: string | null | undefined): value is string {
  return Boolean(value && ORGANIZATION_ID_RE.test(value))
}

/** Profile completion URL scoped to a specific organization (survives refresh). */
export function organizationProfilePath(organizationId?: string | null): string {
  if (!isOrganizationId(organizationId)) return ORG_PROFILE_PATH
  const params = new URLSearchParams({ [ORGANIZATION_ID_QUERY_PARAM]: organizationId })
  return `${ORG_PROFILE_PATH}?${params.toString()}`
}

export function readOrganizationIdQueryParam(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const value = new URLSearchParams(window.location.search).get(ORGANIZATION_ID_QUERY_PARAM)
    return isOrganizationId(value) ? value : null
  } catch {
    return null
  }
}

export type OrganizationProfileSource = Pick<
  OrganizationSummary,
  'name' | 'email' | 'country' | 'pan' | 'gstin'
> &
  Partial<
    Pick<
      OrganizationSummary,
      | 'phone'
      | 'website'
      | 'industry'
      | 'organizationType'
      | 'address'
      | 'description'
      | 'businessSize'
      | 'alternatePhone'
      | 'defaultLanguage'
      | 'businessRegistrationNumber'
    >
  >

export type OrganizationProfileFormValues = {
  name: string
  email: string
  phone: string
  alternatePhone: string
  website: string
  industry: string
  businessSize: string
  organizationType: string
  description: string
  defaultLanguage: string
  businessRegistrationNumber: string
  pan: string
  gstin: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  /** True when a ready profile media asset exists (or was uploaded this session). */
  hasLogo: boolean
}

/** Fields required before the owner may finish initial setup / enter the dashboard. */
export const REQUIRED_PROFILE_FIELDS = [
  'name',
  'email',
  'industry',
  'businessSize',
  'pan',
  'addressLine1',
  'city',
  'state',
  'postalCode',
  'country',
] as const

/** Optional fields that contribute to completion percentage. */
export const OPTIONAL_PROFILE_FIELDS = [
  'phone',
  'alternatePhone',
  'website',
  'organizationType',
  'description',
  'defaultLanguage',
  'businessRegistrationNumber',
  'gstin',
  'addressLine2',
  'hasLogo',
] as const

export type ProfileFieldKey =
  | (typeof REQUIRED_PROFILE_FIELDS)[number]
  | (typeof OPTIONAL_PROFILE_FIELDS)[number]

export type ProfileCompletionResult = {
  percent: number
  requiredComplete: boolean
  filledRequired: number
  totalRequired: number
  filledOptional: number
  totalOptional: number
  missingRequired: ProfileFieldKey[]
  missingOptional: ProfileFieldKey[]
}

/** Address JSON shape — country is NOT included (organizations.country is source of truth). */
export type ProfileAddressPayload = {
  addressLine1: string
  addressLine2?: string | null
  city: string
  state: string
  postalCode: string
}

export function parseOrganizationAddress(
  value: OrganizationAddress | string | null | undefined
): ProfileAddressPayload | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    return {
      addressLine1: trimmed,
      addressLine2: null,
      city: '',
      state: '',
      postalCode: '',
    }
  }
  return {
    addressLine1: value.addressLine1 ?? '',
    addressLine2: value.addressLine2 ?? null,
    city: value.city ?? '',
    state: value.state ?? '',
    postalCode: value.postalCode ?? '',
  }
}

export function formatOrganizationAddressLines(
  address: OrganizationAddress | string | null | undefined,
  country?: string | null
): string {
  const parsed = parseOrganizationAddress(address)
  if (!parsed && !country?.trim()) return ''
  return [
    parsed?.addressLine1,
    parsed?.addressLine2,
    parsed?.city,
    parsed?.state,
    parsed?.postalCode,
    country,
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(', ')
}

function isFilled(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.trim().length > 0
  return false
}

export function organizationToProfileFormValues(
  org: OrganizationProfileSource,
  extras?: { hasLogo?: boolean }
): OrganizationProfileFormValues {
  const address = parseOrganizationAddress(org.address)
  return {
    name: org.name?.trim() ?? '',
    email: org.email?.trim() ?? '',
    phone: org.phone?.trim() ?? '',
    alternatePhone: org.alternatePhone?.trim() ?? '',
    website: org.website?.trim() ?? '',
    industry: org.industry?.trim() ?? '',
    businessSize: org.businessSize?.trim() ?? '',
    organizationType: org.organizationType?.trim() ?? '',
    description: org.description?.trim() ?? '',
    defaultLanguage: org.defaultLanguage?.trim() ?? '',
    businessRegistrationNumber: org.businessRegistrationNumber?.trim() ?? '',
    pan: org.pan?.trim() ?? '',
    gstin: org.gstin?.trim() ?? '',
    addressLine1: address?.addressLine1?.trim() ?? '',
    addressLine2: address?.addressLine2?.trim() ?? '',
    city: address?.city?.trim() ?? '',
    state: address?.state?.trim() ?? '',
    postalCode: address?.postalCode?.trim() ?? '',
    country: (org.country ?? '').trim(),
    hasLogo: extras?.hasLogo ?? false,
  }
}

export function calculateOrganizationProfileCompletion(
  values: OrganizationProfileFormValues
): ProfileCompletionResult {
  const missingRequired = REQUIRED_PROFILE_FIELDS.filter((key) => !isFilled(values[key]))
  const missingOptional = OPTIONAL_PROFILE_FIELDS.filter((key) => !isFilled(values[key]))

  const totalRequired = REQUIRED_PROFILE_FIELDS.length
  const totalOptional = OPTIONAL_PROFILE_FIELDS.length
  const filledRequired = totalRequired - missingRequired.length
  const filledOptional = totalOptional - missingOptional.length
  const total = totalRequired + totalOptional
  const filled = filledRequired + filledOptional
  const percent = total === 0 ? 100 : Math.round((filled / total) * 100)

  return {
    percent,
    requiredComplete: missingRequired.length === 0,
    filledRequired,
    totalRequired,
    filledOptional,
    totalOptional,
    missingRequired: [...missingRequired],
    missingOptional: [...missingOptional],
  }
}

export function isOrganizationRequiredProfileComplete(
  org: OrganizationProfileSource,
  extras?: { hasLogo?: boolean }
): boolean {
  return calculateOrganizationProfileCompletion(
    organizationToProfileFormValues(org, extras)
  ).requiredComplete
}

export function buildOrganizationProfileUpdateBody(values: OrganizationProfileFormValues): {
  name: string
  phone?: string
  website?: string
  industry: string
  organizationType?: 'company' | 'partnership' | 'sole_proprietorship' | 'other'
  description: string | null
  businessSize: string
  alternatePhone: string | null
  defaultLanguage: string | null
  businessRegistrationNumber: string | null
  pan: string
  gstin?: string
  country: string
  address: ProfileAddressPayload
} {
  const organizationType =
    values.organizationType === 'company' ||
    values.organizationType === 'partnership' ||
    values.organizationType === 'sole_proprietorship' ||
    values.organizationType === 'other'
      ? values.organizationType
      : undefined

  const phone = values.phone.trim()
  const website = values.website.trim()
  const normalizedWebsite = website
    ? /^https?:\/\//i.test(website)
      ? website
      : `https://${website}`
    : ''
  const gstin = values.gstin.trim().replace(/\s+/g, '').toUpperCase()

  return {
    name: values.name.trim(),
    ...(phone ? { phone } : {}),
    ...(normalizedWebsite ? { website: normalizedWebsite } : {}),
    industry: values.industry.trim(),
    ...(organizationType ? { organizationType } : {}),
    description: values.description.trim() || null,
    businessSize: values.businessSize.trim(),
    alternatePhone: values.alternatePhone.trim() || null,
    defaultLanguage: values.defaultLanguage.trim() || null,
    businessRegistrationNumber: values.businessRegistrationNumber.trim() || null,
    pan: values.pan.trim().replace(/\s+/g, '').toUpperCase(),
    ...(gstin ? { gstin } : {}),
    country: values.country.trim(),
    address: {
      addressLine1: values.addressLine1.trim(),
      addressLine2: values.addressLine2.trim() || null,
      city: values.city.trim(),
      state: values.state.trim(),
      postalCode: values.postalCode.trim(),
    },
  }
}
