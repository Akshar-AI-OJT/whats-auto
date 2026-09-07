import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { getProductUnlockPath } from '@/lib/product-access'

/**
 * Single frontend product-access view for sidebar gating and route guards.
 * Setup-incomplete → organization profile. Setup complete + unpaid → onboarding plan.
 */
export function useProductAccess() {
  const {
    hasFullProductAccess,
    isSetupComplete,
    isSubscriptionPending,
    isLoading,
    isResolvingAccess,
  } = useOrganizations()

  const accessReady = !isLoading && !isResolvingAccess
  const productNavLocked = accessReady && !hasFullProductAccess
  const unlockPath = getProductUnlockPath({ isSetupComplete })

  return {
    hasFullProductAccess,
    isSetupComplete,
    isSubscriptionPending,
    isLoading,
    isResolvingAccess,
    accessReady,
    productNavLocked,
    unlockPath,
  }
}
