import { RequirePermission } from '@/components/auth/RequirePermission'
import { BillingPage } from '@/components/dashboard/billing/BillingPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function DashboardBillingPage() {
  return (
    <RequirePermission permission={PERMISSIONS.BILLING_VIEW}>
      <BillingPage />
    </RequirePermission>
  )
}
