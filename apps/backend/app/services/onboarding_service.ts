import { OrganizationStatus } from '#enums/organization_status'
import {
  isOrganizationRequiredProfileComplete,
  type OrganizationProfileCompletionSource,
} from '#lib/organization_profile_completion'
import { OrganizationService } from '#services/organization_service'

export type OnboardingStep =
  | 'create_organization'
  | 'select_organization'
  | 'connect_whatsapp'
  | 'complete_payment'
  | 'complete_profile'
  | 'ready'

/**
 * Decide what the client should show after login / signup verification ([D70]).
 */
export function resolveNextStep(params: {
  organizationCount: number
  activeOrganizationId: string | null
  activeOrgStatus?: string | null
  profileComplete?: boolean | null
}): OnboardingStep {
  const { organizationCount, activeOrganizationId, activeOrgStatus, profileComplete } = params

  if (organizationCount === 0) {
    return 'create_organization'
  }

  if (!activeOrganizationId) {
    return 'select_organization'
  }

  if (activeOrgStatus === OrganizationStatus.PENDING_SETUP) {
    return 'connect_whatsapp'
  }

  if (activeOrgStatus === OrganizationStatus.VERIFIED_SETUP) {
    return 'complete_payment'
  }

  if (activeOrgStatus === OrganizationStatus.ACTIVE && profileComplete === false) {
    return 'complete_profile'
  }

  return 'ready'
}

export class OnboardingService {
  /**
   * Single source of truth for post-auth routing.
   */
  async getState(params: { userId: string; activeOrganizationId?: string }) {
    const organizations = await new OrganizationService().listMyOrganizations(params.userId)

    const activeOrganizationId =
      params.activeOrganizationId &&
      organizations.some((org) => org.id === params.activeOrganizationId)
        ? params.activeOrganizationId
        : null

    const activeOrg = activeOrganizationId
      ? organizations.find((org) => org.id === activeOrganizationId)
      : null

    const profileComplete =
      activeOrg && activeOrg.status === OrganizationStatus.ACTIVE
        ? isOrganizationRequiredProfileComplete(activeOrg as OrganizationProfileCompletionSource)
        : null

    return {
      activeOrganizationId,
      organizations,
      nextStep: resolveNextStep({
        organizationCount: organizations.length,
        activeOrganizationId,
        activeOrgStatus: activeOrg?.status ?? null,
        profileComplete,
      }),
    }
  }
}
