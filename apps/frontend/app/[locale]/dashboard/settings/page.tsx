import { RequirePermission } from '@/components/auth/RequirePermission'
import { OrganizationSettingsPage } from '@/components/dashboard/settings/OrganizationSettingsPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function SettingsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ORG_VIEW}>
      <OrganizationSettingsPage />
    </RequirePermission>
  )
}
