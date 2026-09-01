import { OrganizationStatus } from '#enums/organization_status'
import { OrganizationService } from '#services/organization_service'

export type OnboardingStep =
  'create_organization' | 'select_organization' | 'complete_payment' | 'ready'

/**
 * Decide what the client should show after login / signup verification.
 */
export function resolveNextStep(params: {
  organizationCount: number
  activeOrganizationId: string | null
  activeOrgStatus?: string | null
}): OnboardingStep {
  const { organizationCount, activeOrganizationId, activeOrgStatus } = params

  if (organizationCount === 0) {
    return 'create_organization'
  }

  if (!activeOrganizationId) {
    return 'select_organization'
  }

  if (activeOrgStatus === OrganizationStatus.PENDING_SETUP) {
    return 'complete_payment'
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

    return {
      activeOrganizationId,
      organizations,
      nextStep: resolveNextStep({
        organizationCount: organizations.length,
        activeOrganizationId,
        activeOrgStatus: activeOrg?.status ?? null,
      }),
    }
  }
}
