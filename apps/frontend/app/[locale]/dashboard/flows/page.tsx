import { RequirePermission } from '@/components/auth/RequirePermission'
import { PlanGate } from '@/components/auth/PlanGate'
import { FlowsListPage } from '@/components/dashboard/flows/FlowsListPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function FlowsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.AUTOMATIONS_VIEW}>
      <PlanGate featureKey="flowBuilder">
        <FlowsListPage />
      </PlanGate>
    </RequirePermission>
  )
}
