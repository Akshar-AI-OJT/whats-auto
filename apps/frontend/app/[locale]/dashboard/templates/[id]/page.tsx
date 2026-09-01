import { RequirePermission } from '@/components/auth/RequirePermission'
import { TemplateDetailsPage } from '@/components/dashboard/templates/TemplateDetailsPage'
import { PERMISSIONS } from '@/lib/rbac'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function TemplateDetailsRoutePage({ params }: PageProps) {
  const { id } = await params

  return (
    <RequirePermission
      anyOf={[PERMISSIONS.TEMPLATES_VIEW, PERMISSIONS.WHATSAPP_VIEW]}
    >
      <TemplateDetailsPage templateId={id} />
    </RequirePermission>
  )
}
