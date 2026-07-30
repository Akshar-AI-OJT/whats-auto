import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { WorkspaceSettingsPage } from '@/components/dashboard/settings/WorkspaceSettingsPage'

export default function SettingsPage() {
  return (
    <DashboardShell>
      <WorkspaceSettingsPage />
    </DashboardShell>
  )
}
