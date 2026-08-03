import { Suspense } from 'react'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { TeamMembersPage } from '@/components/dashboard/team/TeamMembersPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function TeamPage() {
  return (
    <RequirePermission permission={PERMISSIONS.TEAM_VIEW}>
      <Suspense fallback={<p className="text-sm text-mute">Loading…</p>}>
        <TeamMembersPage />
      </Suspense>
    </RequirePermission>
  )
}
