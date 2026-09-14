import { RequirePermission } from '@/components/auth/RequirePermission'
import { MediaLibraryPage } from '@/components/dashboard/templates/MediaLibraryPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function TemplatesMediaPage() {
  return (
    <RequirePermission permission={PERMISSIONS.MEDIA_VIEW}>
      <MediaLibraryPage />
    </RequirePermission>
  )
}
