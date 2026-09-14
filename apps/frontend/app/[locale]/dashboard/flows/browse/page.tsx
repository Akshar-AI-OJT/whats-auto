import { RequirePermission } from '@/components/auth/RequirePermission'
import { PlanGate } from '@/components/auth/PlanGate'
import { FlowCatalogBrowsePage } from '@/components/dashboard/flows/FlowCatalogBrowsePage'
import { PERMISSIONS } from '@/lib/rbac'

export default function FlowsBrowseRoute() {
  return (
    <RequirePermission permission={PERMISSIONS.AUTOMATIONS_VIEW}>
      <PlanGate featureKey="flowBuilder">
        <FlowCatalogBrowsePage />
      </PlanGate>
    </RequirePermission>
  )
}
