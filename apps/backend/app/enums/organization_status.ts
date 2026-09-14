/**
 * Organization usability / provisioning state.
 * Soft-delete stores status = 'false' (plus deletedAt). Product access requires 'active'.
 * D70 adds only `verified_setup` (WhatsApp + Meta-verified, unpaid).
 */
export enum OrganizationStatus {
  PENDING_SETUP = 'pending_setup',
  /** WhatsApp linked + Meta portfolio verified; unpaid ([D70]). */
  VERIFIED_SETUP = 'verified_setup',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  /** Soft-deleted — kept as the string "false" for soft-delete compatibility. */
  FALSE = 'false',
}

export const ORGANIZATION_STATUSES = Object.values(OrganizationStatus)

export type OrganizationStatusValue = (typeof OrganizationStatus)[keyof typeof OrganizationStatus]

export function isOrganizationActive(status: string | undefined | null): boolean {
  return status === OrganizationStatus.ACTIVE
}

/** Unpaid provisioning states eligible for onboarding cleanup. */
export function isUnpaidSetupStatus(status: string | undefined | null): boolean {
  return status === OrganizationStatus.PENDING_SETUP || status === OrganizationStatus.VERIFIED_SETUP
}
