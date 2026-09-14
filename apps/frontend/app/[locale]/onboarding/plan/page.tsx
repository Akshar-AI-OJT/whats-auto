import { OrganizationsProvider } from '@/components/dashboard/OrganizationsProvider'
import { OnboardingPlanSelectionPage } from '@/components/onboarding/OnboardingPlanSelectionPage'

export default function OrganizationOnboardingPlanPage() {
  return (
    <OrganizationsProvider>
      <OnboardingPlanSelectionPage />
    </OrganizationsProvider>
  )
}
