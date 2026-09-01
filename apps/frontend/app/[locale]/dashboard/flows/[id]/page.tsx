import { RequirePermission } from '@/components/auth/RequirePermission'
import { FlowEditorPage } from '@/components/dashboard/flows/FlowEditorPage'
import { PERMISSIONS } from '@/lib/rbac'

export default async function FlowEditorRoutePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <RequirePermission permission={PERMISSIONS.AUTOMATIONS_VIEW}>
      <FlowEditorPage flowId={id} />
    </RequirePermission>
  )
}
