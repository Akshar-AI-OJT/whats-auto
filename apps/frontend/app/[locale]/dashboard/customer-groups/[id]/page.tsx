import { RequirePermission } from '@/components/auth/RequirePermission'
import { CustomerGroupDetailPage } from '@/components/dashboard/customer-groups/CustomerGroupDetailPage'
import { PERMISSIONS } from '@/lib/rbac'

type CustomerGroupDetailRouteProps = {
  params: Promise<{ id: string }>
}

export default async function CustomerGroupDetailRoutePage({
  params,
}: CustomerGroupDetailRouteProps) {
  const { id } = await params
  return (
    <RequirePermission permission={PERMISSIONS.CONTACTS_VIEW}>
      <CustomerGroupDetailPage groupId={id} />
    </RequirePermission>
  )
}
