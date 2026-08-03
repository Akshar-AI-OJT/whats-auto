import { RequirePermission } from '@/components/auth/RequirePermission'
import { RolesPage } from '@/components/dashboard/team/RolesPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function TeamRolesPage() {
  return (
    <RequirePermission anyOf={[PERMISSIONS.ROLES_VIEW, PERMISSIONS.TEAM_VIEW]}>
      <RolesPage />
    </RequirePermission>
  )
}
