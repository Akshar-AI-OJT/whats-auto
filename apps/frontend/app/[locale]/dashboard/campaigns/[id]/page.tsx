import { RequirePermission } from '@/components/auth/RequirePermission'
import { CampaignDetailsPage } from '@/components/dashboard/campaigns/CampaignDetailsPage'
import { PERMISSIONS } from '@/lib/rbac'

export default async function CampaignDetailsRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <RequirePermission permission={PERMISSIONS.CAMPAIGNS_VIEW}>
      <CampaignDetailsPage campaignId={id} />
    </RequirePermission>
  )
}
