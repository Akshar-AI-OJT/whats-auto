import { RequirePermission } from '@/components/auth/RequirePermission'
import { OrganizationAuditLogsPage } from '@/components/dashboard/audit-logs/OrganizationAuditLogsPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function DashboardAuditLogsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.AUDIT_VIEW}>
      <OrganizationAuditLogsPage />
    </RequirePermission>
  )
}
