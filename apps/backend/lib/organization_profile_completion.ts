import { parseOrganizationAddress } from '#lib/organization_address'

/**
 * Must stay aligned with `CREATE_PLACEHOLDER_*` in
 * `apps/frontend/lib/organization-profile.ts`.
 * Create-org sentinels satisfy the API contract but do not complete the profile.
 */
export const CREATE_PLACEHOLDER_PAN = 'SETUP0000A'
export const CREATE_PLACEHOLDER_ADDRESS = 'Address pending'

/**
 * Required organization profile fields — must stay aligned with
 * `REQUIRED_PROFILE_FIELDS` in apps/frontend/lib/organization-profile.ts.
 *
 * Rules:
 * - `pan` is required.
 * - Placeholder PAN `SETUP0000A` is not complete.
 * - Placeholder address line `Address pending` is not complete.
 * - Any other required field must be a non-empty trimmed string.
 * Logo and other optional fields do not affect this gate.
 */
export const ORGANIZATION_REQUIRED_PROFILE_FIELDS = [
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

export type OrganizationRequiredProfileField =
  (typeof ORGANIZATION_REQUIRED_PROFILE_FIELDS)[number]

/** Columns used to decide whether the organization profile is complete. */
export type OrganizationProfileCompletionSource = {
  name?: string | null
  email?: string | null
  industry?: string | null
  businessSize?: string | null
  pan?: string | null
  country?: string | null
  address?: unknown
}

export type OrganizationProfileCompletionResult = {
  profileCompleted: boolean
  missingRequired: OrganizationRequiredProfileField[]
}

export function isCreatePlaceholderPan(value: string | null | undefined): boolean {
  return (value ?? '').trim().replace(/\s+/g, '').toUpperCase() === CREATE_PLACEHOLDER_PAN
}

export function isCreatePlaceholderAddress(value: string | null | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === CREATE_PLACEHOLDER_ADDRESS.toLowerCase()
}

function isRequiredValueFilled(field: OrganizationRequiredProfileField, value: string): boolean {
  if (field === 'pan' && isCreatePlaceholderPan(value)) return false
  if (field === 'addressLine1' && isCreatePlaceholderAddress(value)) return false
  return value.trim().length > 0
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
    pan: source.pan?.trim() ?? '',
    addressLine1: address?.addressLine1?.trim() ?? '',
    city: address?.city?.trim() ?? '',
    state: address?.state?.trim() ?? '',
    postalCode: address?.postalCode?.trim() ?? '',
    country: source.country?.trim() ?? '',
  }
}

/**
 * Single backend definition of organization profile completion.
 * `profileCompleted` is true only when every required field is filled
 * and create-org placeholders are not used.
 */
export function calculateOrganizationProfileCompletion(
  source: OrganizationProfileCompletionSource
): OrganizationProfileCompletionResult {
  const values = requiredFieldValues(source)
  const missingRequired = ORGANIZATION_REQUIRED_PROFILE_FIELDS.filter(
    (key) => !isRequiredValueFilled(key, values[key])
  )
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
