'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { usePermissions } from '@/hooks/usePermissions'
import { AccessDenied } from '@/components/auth/AccessDenied'
import { DashboardShell } from '@/components/dashboard/DashboardShell'

type RequirePermissionProps = {
  /** Single required permission. */
  permission?: string
  /** Pass if any one permission is enough. */
  anyOf?: readonly string[]
  /** Pass if every permission is required. */
  allOf?: readonly string[]
  children: ReactNode
  /**
   * When true, wraps with DashboardShell. Dashboard routes already get a shell
   * from `app/[locale]/dashboard/layout.tsx`, so leave this false there.
   */
  withShell?: boolean
}

function allowed(
  hasPermission: (p: string) => boolean,
  hasAnyPermission: (p: readonly string[]) => boolean,
  hasAllPermissions: (p: readonly string[]) => boolean,
  props: Pick<RequirePermissionProps, 'permission' | 'anyOf' | 'allOf'>
) {
  if (props.allOf && props.allOf.length > 0) {
    return hasAllPermissions(props.allOf)
  }
  if (props.anyOf && props.anyOf.length > 0) {
    return hasAnyPermission(props.anyOf)
  }
  if (props.permission) {
    return hasPermission(props.permission)
  }
  return false
}

function RequirePermissionInner({
  permission,
  anyOf,
  allOf,
  children,
}: Omit<RequirePermissionProps, 'withShell'>) {
  const t = useTranslations('dashboard.accessDenied')
  const { isResolvingAccess } = useOrganizations()
  const { isLoading, hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions()

  const loading = isResolvingAccess || isLoading
  const ok = allowed(hasPermission, hasAnyPermission, hasAllPermissions, {
    permission,
    anyOf,
    allOf,
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-body">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t('loading')}
      </div>
    )
  }

  if (!ok) {
    return <AccessDenied title={t('title')} description={t('description')} />
  }

  return <>{children}</>
}

/**
 * Route/page guard — shows Access Denied when the session lacks required permissions.
 * Shell wraps first so permission checks run inside OrganizationsProvider.
 */
export function RequirePermission({
  withShell = false,
  ...props
}: RequirePermissionProps) {
  const inner = <RequirePermissionInner {...props} />
  return withShell ? <DashboardShell>{inner}</DashboardShell> : inner
}
