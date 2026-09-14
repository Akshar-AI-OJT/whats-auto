import { RequirePermission } from '@/components/auth/RequirePermission'
import { TemplateCatalogBrowsePage } from '@/components/dashboard/templates/TemplateCatalogBrowsePage'
import { PERMISSIONS } from '@/lib/rbac'

export default function TemplatesBrowseRoute() {
  return (
    <RequirePermission
      anyOf={[PERMISSIONS.TEMPLATES_VIEW, PERMISSIONS.WHATSAPP_VIEW]}
    >
      <TemplateCatalogBrowsePage />
    </RequirePermission>
  )
}
