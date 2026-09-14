import { RequirePermission } from '@/components/auth/RequirePermission'
import { OrganizationAnalyticsPage } from '@/components/dashboard/analytics/OrganizationAnalyticsPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function AnalyticsRoutePage() {
  return (
    <RequirePermission permission={PERMISSIONS.ANALYTICS_VIEW}>
      <OrganizationAnalyticsPage />
    </RequirePermission>
  )
}
