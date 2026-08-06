import { RequirePermission } from '@/components/auth/RequirePermission'
import { WhatsappConnectionPage } from '@/components/dashboard/whatsapp/WhatsappConnectionPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function WhatsappRoutePage() {
  return (
    <RequirePermission permission={PERMISSIONS.WHATSAPP_VIEW}>
      <WhatsappConnectionPage />
    </RequirePermission>
  )
}
