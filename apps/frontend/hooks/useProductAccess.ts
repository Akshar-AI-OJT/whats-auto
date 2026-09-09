import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { canAccessWhatsappSetup, getProductUnlockPath } from '@/lib/product-access'

/**
 * Single frontend product-access view for sidebar gating and route guards ([D70]).
 */
export function useProductAccess() {
  const {
    hasFullProductAccess,
    isSetupComplete,
    isSubscriptionPending,
    isLoading,
    isResolvingAccess,
    tenantOrganizationId,
    activeOrganizationId,
    accessContext,
  } = useOrganizations()

  const accessReady = !isLoading && !isResolvingAccess
  const productNavLocked = accessReady && !hasFullProductAccess
  const organizationId = tenantOrganizationId ?? activeOrganizationId
  const organizationStatus = accessContext?.status ?? null
  const unlockPath = getProductUnlockPath({
    isSetupComplete,
    organizationStatus,
    organizationId,
  })
  const whatsappSetupAllowed = canAccessWhatsappSetup(organizationStatus)

  return {
    hasFullProductAccess,
    isSetupComplete,
    isSubscriptionPending,
    organizationStatus,
    isLoading,
    isResolvingAccess,
    accessReady,
    productNavLocked,
    organizationId,
    unlockPath,
    whatsappSetupAllowed,
  }
}
