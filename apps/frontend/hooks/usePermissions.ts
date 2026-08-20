'use client'

import { useCallback, useMemo } from 'react'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import {
  hasAllPermissions as hasAll,
  hasAnyPermission as hasAny,
  hasPermission as hasOne,
} from '@/lib/rbac'

const EMPTY_PERMISSIONS: readonly string[] = []
/**
 * Permission checks against the active org access-context from OrganizationsProvider.
 * Does not introduce a separate auth store.
 */
export function usePermissions() {
  const { accessContext, isResolvingAccess } = useOrganizations()
  const permissions = accessContext?.permissions ?? EMPTY_PERMISSIONS

  const hasPermission = useCallback(
    (permission: string) => hasOne(permissions, permission),
    [permissions]
  )

  const hasAnyPermission = useCallback(
    (required: readonly string[]) => hasAny(permissions, required),
    [permissions]
  )

  const hasAllPermissions = useCallback(
    (required: readonly string[]) => hasAll(permissions, required),
    [permissions]
  )

  return useMemo(
    () => ({
      isLoading: isResolvingAccess,
      permissions,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
    }),
    [isResolvingAccess, permissions, hasPermission, hasAnyPermission, hasAllPermissions]
  )
}
