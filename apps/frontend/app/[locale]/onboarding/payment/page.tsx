import { OrganizationsProvider } from '@/components/dashboard/OrganizationsProvider'
import { OnboardingPaymentPage } from '@/components/onboarding/OnboardingPaymentPage'

export default function OrganizationOnboardingPaymentPage() {
  return (
    <OrganizationsProvider>
      <OnboardingPaymentPage />
    </OrganizationsProvider>
  )
}
