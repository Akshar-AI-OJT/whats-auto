import { RequirePermission } from '@/components/auth/RequirePermission'
import { WorkspaceSettingsPage } from '@/components/dashboard/settings/WorkspaceSettingsPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function SettingsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ORG_VIEW}>
      <WorkspaceSettingsPage />
    </RequirePermission>
  )
}
