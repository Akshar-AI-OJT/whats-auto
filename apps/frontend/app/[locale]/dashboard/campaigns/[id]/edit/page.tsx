import { RequirePermission } from '@/components/auth/RequirePermission'
import { CampaignFormPage } from '@/components/dashboard/campaigns/CampaignFormPage'
import { PERMISSIONS } from '@/lib/rbac'

export default async function CampaignEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <RequirePermission permission={PERMISSIONS.CAMPAIGNS_EDIT}>
      <CampaignFormPage mode="edit" campaignId={id} />
    </RequirePermission>
  )
}
