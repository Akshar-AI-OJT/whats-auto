import { parseOrganizationAddress } from '#lib/organization_address'

/**
 * Required organization profile fields — must stay aligned with
 * `REQUIRED_PROFILE_FIELDS` in apps/frontend/lib/organization-profile.ts.
 * Logo and other optional fields do not affect this gate.
 */
export const ORGANIZATION_REQUIRED_PROFILE_FIELDS = [
  'name',
  'email',
  'industry',
  'businessSize',
  'addressLine1',
  'city',
  'state',
  'postalCode',
  'country',
] as const

export type OrganizationRequiredProfileField =
  (typeof ORGANIZATION_REQUIRED_PROFILE_FIELDS)[number]

/** Columns used to decide whether the organization profile is complete. */
export type OrganizationProfileCompletionSource = {
  name?: string | null
  email?: string | null
  industry?: string | null
  businessSize?: string | null
  country?: string | null
  address?: unknown
}

export type OrganizationProfileCompletionResult = {
  profileCompleted: boolean
  missingRequired: OrganizationRequiredProfileField[]
}

function isFilled(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.trim().length > 0
  return false
}

function requiredFieldValues(
  source: OrganizationProfileCompletionSource
): Record<OrganizationRequiredProfileField, string> {
  const address = parseOrganizationAddress(source.address)
  return {
    name: source.name?.trim() ?? '',
    email: source.email?.trim() ?? '',
    industry: source.industry?.trim() ?? '',
    businessSize: source.businessSize?.trim() ?? '',
    addressLine1: address?.addressLine1?.trim() ?? '',
    city: address?.city?.trim() ?? '',
    state: address?.state?.trim() ?? '',
    postalCode: address?.postalCode?.trim() ?? '',
    country: source.country?.trim() ?? '',
  }
}

/**
 * Single backend definition of organization profile completion.
 * `profileCompleted` is true only when every required field is filled.
 */
export function calculateOrganizationProfileCompletion(
  source: OrganizationProfileCompletionSource
): OrganizationProfileCompletionResult {
  const values = requiredFieldValues(source)
  const missingRequired = ORGANIZATION_REQUIRED_PROFILE_FIELDS.filter((key) => !isFilled(values[key]))
  return {
    profileCompleted: missingRequired.length === 0,
    missingRequired: [...missingRequired],
  }
}

export function isOrganizationRequiredProfileComplete(
  source: OrganizationProfileCompletionSource
): boolean {
  return calculateOrganizationProfileCompletion(source).profileCompleted
}
