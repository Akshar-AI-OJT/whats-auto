import { RequirePermission } from '@/components/auth/RequirePermission'
import { RoleEditorFullPageRoute } from '@/components/dashboard/team/RoleEditorFullPageRoute'
import { PERMISSIONS } from '@/lib/rbac'

type PageProps = {
  params: Promise<{ roleKey: string }>
}

export default async function TeamRolesEditPage({ params }: PageProps) {
  const { roleKey } = await params

  return (
    <RequirePermission anyOf={[PERMISSIONS.ROLES_VIEW, PERMISSIONS.TEAM_VIEW]}>
      <RoleEditorFullPageRoute mode="edit" roleKey={roleKey} />
    </RequirePermission>
  )
}

