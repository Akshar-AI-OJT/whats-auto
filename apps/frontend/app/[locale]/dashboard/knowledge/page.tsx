import { RequirePermission } from '@/components/auth/RequirePermission'
import { KnowledgeBasePage } from '@/components/dashboard/knowledge/KnowledgeBasePage'
import { PERMISSIONS } from '@/lib/rbac'

export default function KnowledgePage() {
  return (
    <RequirePermission permission={PERMISSIONS.AI_KB_VIEW}>
      <KnowledgeBasePage />
    </RequirePermission>
  )
}
