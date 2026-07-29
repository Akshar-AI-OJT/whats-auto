import { Suspense } from 'react'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { TeamMembersPage } from '@/components/dashboard/team/TeamMembersPage'

export default function TeamPage() {
  return (
    <DashboardShell>
      <Suspense fallback={<p className="text-sm text-mute">Loading…</p>}>
        <TeamMembersPage />
      </Suspense>
    </DashboardShell>
  )
}
