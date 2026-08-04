import { RequirePermission } from '@/components/auth/RequirePermission'
import { RoleEditorFullPageRoute } from '@/components/dashboard/team/RoleEditorFullPageRoute'
import { PERMISSIONS } from '@/lib/rbac'

export default function TeamRolesCreatePage() {
  return (
    <RequirePermission anyOf={[PERMISSIONS.ROLES_VIEW, PERMISSIONS.TEAM_VIEW]}>
      <RoleEditorFullPageRoute mode="create" />
    </RequirePermission>
  )
}

