/**
 * Organization usability / provisioning state.
 * Soft-delete stores status = 'false' (plus deletedAt). Product access requires 'active'.
 */
export enum OrganizationStatus {
  PENDING_SETUP = 'pending_setup',
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
