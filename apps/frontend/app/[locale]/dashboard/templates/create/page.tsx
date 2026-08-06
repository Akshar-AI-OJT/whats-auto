import { Suspense } from 'react'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { TemplateCreatePage } from '@/components/dashboard/templates/TemplateCreatePage'
import { PERMISSIONS } from '@/lib/rbac'

export default function TemplatesCreatePage() {
  return (
    <RequirePermission permission={PERMISSIONS.WHATSAPP_MANAGE}>
      <Suspense fallback={null}>
        <TemplateCreatePage />
      </Suspense>
    </RequirePermission>
  )
}
