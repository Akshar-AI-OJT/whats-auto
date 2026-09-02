import { Suspense } from 'react'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { ContactsPage } from '@/components/dashboard/contacts/ContactsPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function ContactsRoutePage() {
  return (
    <RequirePermission permission={PERMISSIONS.CONTACTS_VIEW}>
      <Suspense fallback={<p className="text-sm text-mute">Loading…</p>}>
        <ContactsPage />
      </Suspense>
    </RequirePermission>
  )
}
