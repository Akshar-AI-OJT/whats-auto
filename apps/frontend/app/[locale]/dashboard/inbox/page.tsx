import { RequirePermission } from '@/components/auth/RequirePermission'
import { InboxConversationsPage } from '@/components/dashboard/inbox/InboxConversationsPage'
import { PERMISSIONS } from '@/lib/rbac'

export default function InboxRoutePage() {
  return (
    <RequirePermission permission={PERMISSIONS.INBOX_VIEW}>
      <InboxConversationsPage />
    </RequirePermission>
  )
}
