import { RequirePermission } from '@/components/auth/RequirePermission'
import { IntegrationsPage } from '@/components/dashboard/integrations/IntegrationsPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function IntegrationsRoutePage() {
  return (
    <RequirePermission permission={PERMISSIONS.INTEGRATIONS_VIEW}>
      <IntegrationsPage />
    </RequirePermission>
  )
}
