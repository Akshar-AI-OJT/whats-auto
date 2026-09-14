import { OrganizationsProvider } from '@/components/dashboard/OrganizationsProvider'
import { OrganizationProfileCompletionPage } from '@/components/onboarding/OrganizationProfileCompletionPage'

export default function OrganizationProfilePage() {
  return (
    <OrganizationsProvider>
      <OrganizationProfileCompletionPage />
    </OrganizationsProvider>
  )
}
