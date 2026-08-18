import { RequirePermission } from '@/components/auth/RequirePermission'
import { TemplatesListPage } from '@/components/dashboard/templates/TemplatesListPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function TemplatesPage() {
  return (
    <RequirePermission
      anyOf={[PERMISSIONS.TEMPLATES_VIEW, PERMISSIONS.WHATSAPP_VIEW]}
    >
      <TemplatesListPage />
    </RequirePermission>
  )
}
