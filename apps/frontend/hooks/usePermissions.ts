'use client'

import { useCallback, useMemo } from 'react'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import {
  hasAllPermissions as hasAll,
  hasAnyPermission as hasAny,
  hasPermission as hasOne,
} from '@/lib/rbac'

/**
 * Permission checks against the active org access-context from OrganizationsProvider.
 * Does not introduce a separate auth store.
 */
export function usePermissions() {
  const { accessContext, isLoading } = useOrganizations()
  const permissions = accessContext?.permissions ?? []

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
      isLoading,
      permissions,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
    }),
    [isLoading, permissions, hasPermission, hasAnyPermission, hasAllPermissions]
  )
}
