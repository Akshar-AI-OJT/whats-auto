export enum OrganizationVerificationStatus {
  Unverified = 'unverified',
  PendingReview = 'pending_review',
  Verified = 'verified',
  Rejected = 'rejected',
}

export const ORGANIZATION_VERIFICATION_STATUSES = Object.values(OrganizationVerificationStatus)

export function isOrganizationVerificationStatus(
  value: unknown
): value is OrganizationVerificationStatus {
  return (
    typeof value === 'string' && (ORGANIZATION_VERIFICATION_STATUSES as string[]).includes(value)
  )
}

/** Narrow the generated Lucid `string` column. Unknown values map to unverified. */
export function parseOrganizationVerificationStatus(
  value: unknown
): OrganizationVerificationStatus {
  if (isOrganizationVerificationStatus(value)) {
    return value
  }
  return OrganizationVerificationStatus.Unverified
}
