import { RequirePermission } from '@/components/auth/RequirePermission'
import { PlanGate } from '@/components/auth/PlanGate'
import { CampaignsListPage } from '@/components/dashboard/campaigns/CampaignsListPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function CampaignsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CAMPAIGNS_VIEW}>
      <PlanGate featureKey="scheduledCampaigns">
        <CampaignsListPage />
      </PlanGate>
    </RequirePermission>
  )
}
