import { RequirePermission } from '@/components/auth/RequirePermission'
import { InboxConversationThread } from '@/components/dashboard/inbox/InboxConversationThread'
import { PERMISSIONS } from '@/lib/rbac'

export default async function InboxConversationRoutePage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params

  return (
    <RequirePermission permission={PERMISSIONS.INBOX_VIEW}>
      <InboxConversationThread conversationId={conversationId} />
    </RequirePermission>
  )
}
