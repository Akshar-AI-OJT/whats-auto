import { RequirePermission } from '@/components/auth/RequirePermission'
import { CampaignFormPage } from '@/components/dashboard/campaigns/CampaignFormPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function CampaignCreatePage() {
  return (
    <RequirePermission permission={PERMISSIONS.CAMPAIGNS_CREATE}>
      <CampaignFormPage mode="create" />
    </RequirePermission>
  )
}
