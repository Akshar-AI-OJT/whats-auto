import { RequirePermission } from '@/components/auth/RequirePermission'
import { CustomerGroupsPage } from '@/components/dashboard/customer-groups/CustomerGroupsPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function CustomerGroupsRoutePage() {
  return (
    <RequirePermission permission={PERMISSIONS.CONTACTS_VIEW}>
      <CustomerGroupsPage />
    </RequirePermission>
  )
}
