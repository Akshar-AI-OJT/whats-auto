'use client'

import { useRouter } from '@/i18n/navigation'
import { RoleEditorFullPage } from './RoleEditorFullPage'

export function RoleEditorFullPageRoute({
  mode,
  roleKey,
}: {
  mode: 'create' | 'edit'
  roleKey?: string
}) {
  const router = useRouter()

  return (
    <RoleEditorFullPage
      mode={mode}
      roleKey={roleKey}
      onSaved={() => router.refresh()}
      onCancel={() => router.push('/dashboard/team/roles')}
    />
  )
}

