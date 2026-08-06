'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Loader2, Search, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, type ApiError, type OrganizationRole } from '@/lib/api'
import {
  groupProductPermissions,
  PRODUCT_PERMISSIONS,
  type ProductPermission,
} from '@/lib/product-permissions'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'

const RESOURCE_LABELS: Record<string, string> = {
  inbox: 'Conversations',
  contacts: 'Contacts',
  campaigns: 'Campaigns',
  templates: 'Templates',
  analytics: 'Reports',
  history: 'Reports',
  org: 'Organization',
  team: 'Users',
  ai: 'AI',
  automations: 'Automations',
  notifications: 'Notifications',
  roles: 'Roles',
  billing: 'Billing',
  whatsapp: 'WhatsApp',
  integrations: 'Integrations',
  audit: 'Audit',
}

const RESOURCE_ORDER = [
  'inbox',
  'contacts',
  'campaigns',
  'templates',
  'reports',
  'org',
  'team',
  'ai',
  'automations',
  'notifications',
  'roles',
  'billing',
  'whatsapp',
  'integrations',
  'audit',
] as const

const PERMISSION_LABELS: Record<string, string> = {
  'inbox:view': 'View',
  'inbox:reply': 'Reply',
  'inbox:assign': 'Assign',
  'inbox:close': 'Close',
  'contacts:view': 'View',
  'contacts:create': 'Create',
  'contacts:edit': 'Edit',
  'contacts:delete': 'Delete',
  'contacts:import': 'Import',
  'contacts:export': 'Export',
  'campaigns:view': 'View',
  'campaigns:create': 'Create',
  'campaigns:edit': 'Edit',
  'campaigns:pause': 'Pause',
  'campaigns:launch': 'Schedule',
  'campaigns:delete': 'Delete',
  'templates:view': 'View',
  'templates:create': 'Create',
  'templates:edit': 'Edit',
  'templates:sync': 'Submit to Meta',
  'templates:delete': 'Delete',
  'analytics:view': 'Dashboard',
  'analytics:export': 'Export',
  'history:export': 'Campaign Reports',
  'org:view': 'View Settings',
  'org:settings_manage': 'Edit Settings',
  'org:delete': 'Delete Organization',
  'team:view': 'View',
  'team:invite': 'Invite',
  'team:remove': 'Remove',
  'team:role_assign': 'Edit',
  'ai:draft': 'Generate Replies',
  'ai:kb_view': 'View Knowledge Base',
  'ai:kb_manage': 'Manage Knowledge Base',
  'ai:agent_manage': 'Generate Templates',
}

const ACTION_ORDER = [
  'view',
  'create',
  'edit',
  'reply',
  'assign',
  'close',
  'schedule',
  'pause',
  'launch',
  'sync',
  'import',
  'export',
  'invite',
  'remove',
  'role_assign',
  'draft',
  'kb_view',
  'kb_manage',
  'agent_manage',
  'delete',
] as const

function unwrapList<T>(data: { data?: T[] } | T[] | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.data)) return data.data
  return []
}

export type RoleEditorFullPageProps = {
  mode: 'create' | 'edit'
  /**
   * For edit mode only: the role key to load.
   * (No backend API exists for "get role by key", so we load from roles.list.)
   */
  roleKey?: string
  /**
   * Called after a successful create/update/reset flow.
   * Typically used to refresh the roles list.
   */
  onSaved?: () => void
  /**
   * Called when user clicks Cancel (or a successful Save redirects back).
   */
  onCancel?: () => void
}

function slugPreview(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20)
}

function startCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function resourceLabel(resource: string) {
  if (resource === 'reports') return 'Reports'
  return RESOURCE_LABELS[resource] ?? startCase(resource)
}

function actionLabel(permission: string) {
  return PERMISSION_LABELS[permission] ?? startCase(permission.split(':')[1] ?? permission)
}

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

export function RoleEditorFullPage({
  mode,
  roleKey,
  onSaved,
  onCancel,
}: RoleEditorFullPageProps) {
  const t = useTranslations('dashboard.roles.editor')
  const tRoles = useTranslations('dashboard.roles')
  const { accessContext, canManageRoles, tenantOrganizationId } = useOrganizations()
  const TEMP_ROLE_EDIT_REASON = 'Permissions updated from role editor'

  const nameId = useId()
  const searchId = useId()
  const formErrorId = useId()

  const [role, setRole] = useState<OrganizationRole | null>(
    mode === 'edit' ? null : null
  )
  const [roleLoading, setRoleLoading] = useState(mode === 'edit')
  const [roleLoadError, setRoleLoadError] = useState<string | null>(null)

  const grantable = useMemo(() => {
    const held = new Set(accessContext?.permissions ?? [])
    const fromContext = PRODUCT_PERMISSIONS.filter((p) => held.has(p))
    if (fromContext.length > 0) return fromContext
    return canManageRoles ? [...PRODUCT_PERMISSIONS] : []
  }, [accessContext?.permissions, canManageRoles])

  const groups = useMemo(() => groupProductPermissions(grantable), [grantable])

  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [initialSelected, setInitialSelected] = useState<Set<string>>(new Set())
  const [permSearch, setPermSearch] = useState('')
  const [openResource, setOpenResource] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [permsError, setPermsError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const dirty = useMemo(() => {
    if (mode === 'create') {
      return name.trim().length > 0 || selected.size > 0
    }
    return !setsEqual(selected, initialSelected)
  }, [mode, name, selected, initialSelected])

  const filteredGroups = useMemo(() => {
    const q = permSearch.trim().toLowerCase()
    const visible = q
      ? groups
          .map((group) => ({
            ...group,
            permissions: group.permissions.filter(
              (permission) =>
                permission.toLowerCase().includes(q) ||
                group.resource.toLowerCase().includes(q) ||
                resourceLabel(group.resource).toLowerCase().includes(q)
            ),
          }))
          .filter((group) => group.permissions.length > 0)
      : groups

    const merged = new Map<string, { resource: string; permissions: string[] }>()
    for (const group of visible) {
      const key =
        group.resource === 'analytics' || group.resource === 'history'
          ? 'reports'
          : group.resource
      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, { resource: key, permissions: [...group.permissions] })
      } else {
        existing.permissions.push(...group.permissions)
      }
    }

    const normalized = [...merged.values()].map((group) => {
      const sortedPermissions = [...new Set(group.permissions)].sort((a, b) => {
        const actionA = a.split(':')[1] ?? ''
        const actionB = b.split(':')[1] ?? ''
        const idxA = ACTION_ORDER.indexOf(actionA as (typeof ACTION_ORDER)[number])
        const idxB = ACTION_ORDER.indexOf(actionB as (typeof ACTION_ORDER)[number])
        if (idxA === -1 && idxB === -1) return a.localeCompare(b)
        if (idxA === -1) return 1
        if (idxB === -1) return -1
        return idxA - idxB
      })
      return { resource: group.resource, permissions: sortedPermissions }
    })

    return normalized.sort((a, b) => {
      const idxA = RESOURCE_ORDER.indexOf(a.resource as (typeof RESOURCE_ORDER)[number])
      const idxB = RESOURCE_ORDER.indexOf(b.resource as (typeof RESOURCE_ORDER)[number])
      if (idxA === -1 && idxB === -1) return a.resource.localeCompare(b.resource)
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })
  }, [groups, permSearch])

  function togglePermission(permission: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(permission)) next.delete(permission)
      else next.add(permission)
      return next
    })
  }

  function toggleGroup(permissions: readonly string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const permission of permissions) {
        if (checked) next.add(permission)
        else next.delete(permission)
      }
      return next
    })
  }

  function toggleAllPermissions(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const permission of grantable) {
        if (checked) next.add(permission)
        else next.delete(permission)
      }
      return next
    })
  }

  function mapError(apiError: ApiError): string {
    if (apiError.status === 401) return t('errors.sessionExpired')
    if (apiError.status === 403 || apiError.code === 'PERMISSION_DENIED') {
      return t('errors.permissionDenied')
    }
    if (apiError.code === 'E_PERMISSION_ESCALATION') return t('errors.escalation')
    if (apiError.code === 'E_ROLE_PROTECTED') return t('errors.protected')
    if (apiError.code === 'E_ROLE_RESERVED' || apiError.code === 'E_ROLE_INVALID_KEY') {
      return t('errors.invalidKey')
    }
    return apiError.message || t('errors.generic')
  }

  function requestCancel() {
    if (pending) return
    if (dirty) {
      const confirmed = window.confirm(t('unsavedConfirm'))
      if (!confirmed) return
    }
    onCancel?.()
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNameError(null)
    setPermsError(null)

    if (!canManageRoles || !tenantOrganizationId) {
      setError(t('errors.permissionDenied'))
      return
    }

    if (!dirty) return

    const permissions = [...selected]
    if (permissions.length === 0) {
      setPermsError(t('errors.permissionsRequired'))
      return
    }

    if (mode === 'create') {
      const trimmed = name.trim()
      if (trimmed.length < 2) {
        setNameError(t('errors.nameRequired'))
        return
      }
      if (trimmed.length > 20) {
        setNameError(t('errors.nameTooLong'))
        return
      }
      const key = slugPreview(trimmed)
      if (!key) {
        setNameError(t('errors.invalidKey'))
        return
      }
    } else {
      if (!role) {
        setError(t('errors.generic'))
        return
      }
    }

    setPending(true)
    try {
      if (mode === 'create') {
        await api.roles.create({ name: name.trim(), permissions })
      } else if (role) {
        await api.roles.update(role.role, {
          permissions,
          // Audit reason UI is temporarily disabled; keep API contract satisfied.
          reason: TEMP_ROLE_EDIT_REASON,
        })
      }

      onSaved?.()
      onCancel?.()
    } catch (err) {
      setError(mapError(err as ApiError))
    } finally {
      setPending(false)
    }
  }

  useEffect(() => {
    // Reset editor state when we navigate between different roles.
    setError(null)
    setNameError(null)
    setPermsError(null)
    setPending(false)
    setPermSearch('')
    setOpenResource(null)

    if (mode === 'create') {
      setRole(null)
      setName('')
      setSelected(new Set())
      setInitialSelected(new Set())
      return
    }

    // Edit mode: load role from /api/v1/roles (only API available).
    setRoleLoading(true)
    setRoleLoadError(null)
    void api.roles
      .list()
      .then((result) => {
        const roles = unwrapList<OrganizationRole>((result as { data?: OrganizationRole[] }).data)
        const found = roles.find((r) => r.role === roleKey) ?? null
        setRole(found)
        if (!found) return

        const nextSelected = new Set(
          found.permissions.filter((p) => grantable.includes(p as ProductPermission))
        )
        setName(found.role)
        setSelected(nextSelected)
        setInitialSelected(new Set(nextSelected))
      })
      .catch((err) => {
        setRoleLoadError((err as ApiError).message || t('errors.loadFailed'))
      })
      .finally(() => {
        setRoleLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, roleKey])

  useEffect(() => {
    // When grantable set changes (permissions/context), re-map initial selection for edit mode.
    if (mode !== 'edit') return
    if (!role) return
    const nextSelected = new Set(
      role.permissions.filter((p) => grantable.includes(p as ProductPermission))
    )
    setSelected(nextSelected)
    setInitialSelected(new Set(nextSelected))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantable])

  useEffect(() => {
    // Accordion behavior: default first expanded; only one section open at a time.
    if (filteredGroups.length === 0) {
      setOpenResource(null)
      return
    }
    if (!openResource || !filteredGroups.some((g) => g.resource === openResource)) {
      setOpenResource(filteredGroups[0]!.resource)
    }
  }, [filteredGroups, openResource])

  const title =
    mode === 'create'
      ? t('createTitle')
      : t('editTitle', { role: (role?.role ?? '').toUpperCase() })
  const keyHint = mode === 'create' ? slugPreview(name) : role?.role
  const saveDisabled = pending || !canManageRoles || !dirty

  if (mode === 'edit' && roleLoading) {
    return (
      <DashboardPanel className="p-4 sm:p-5 md:p-6">
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-body">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {tRoles('loading')}
        </div>
      </DashboardPanel>
    )
  }

  if (mode === 'edit' && roleLoadError) {
    return (
      <DashboardPanel className="p-4 sm:p-5 md:p-6">
        <div className="rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative">
          {roleLoadError}
        </div>
      </DashboardPanel>
    )
  }

  if (mode === 'edit' && !role) {
    return (
      <DashboardPanel className="p-4 sm:p-5 md:p-6">
        <div className="flex flex-col gap-3">
          <p className="font-medium text-ink">{tRoles('emptyTitle')}</p>
          <Button type="button" variant="outline" onClick={requestCancel}>
            {t('cancel')}
          </Button>
        </div>
      </DashboardPanel>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1160px]">
      <DashboardPanel as="section" className="rounded-2xl p-4 sm:p-5 md:p-6">
      <form
        className="flex min-w-0 flex-col gap-5"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={pending}
        aria-describedby={error ? formErrorId : undefined}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="font-display text-[1.7rem] tracking-tight text-ink sm:text-[1.95rem]">
              {title}
            </h1>
            {dirty ? (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-ink"
              >
                <span className="size-1.5 rounded-full bg-warning-deep" aria-hidden />
                {t('unsavedChanges')}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 pb-20">
          <FieldGroup className="gap-5">
            {mode === 'create' ? (
              <Field data-invalid={Boolean(nameError)} className="max-w-2xl gap-2">
                <FieldLabel htmlFor={nameId}>{t('name')}</FieldLabel>
                <Input
                  id={nameId}
                  value={name}
                  maxLength={20}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                  aria-invalid={Boolean(nameError)}
                />
                <FieldDescription>
                  {t('nameHint')}
                  {keyHint ? (
                    <span className="mt-1 block font-mono text-xs text-mute">
                      {t('keyPreview', { key: keyHint })}
                    </span>
                  ) : null}
                </FieldDescription>
                {nameError ? <FieldError>{nameError}</FieldError> : null}
              </Field>
            ) : (
              <div className="max-w-2xl rounded-xl border border-dash-border bg-dash-surface/60 px-3 py-2">
                <p className="text-xs font-semibold tracking-wide text-mute uppercase">{t('roleKey')}</p>
                <p className="mt-1 font-mono text-sm text-ink">
                  {(role?.role ?? '').toUpperCase()}
                </p>
              </div>
            )}

            <Field data-invalid={Boolean(permsError)}>
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <FieldLabel className="text-base font-semibold text-ink">{t('permissions')}</FieldLabel>
                    <FieldDescription className="text-xs text-mute">{t('permissionsHint')}</FieldDescription>
                  </div>
                  <p className="shrink-0 text-right text-[11px] font-medium text-mute/90 tabular-nums">
                    {t('enabledTotal', { enabled: selected.size, total: grantable.length })}
                  </p>
                </div>

                <label className="inline-flex w-fit items-center gap-2 rounded-lg border border-dash-border bg-dash-surface/50 px-3 py-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-dash-border"
                    checked={grantable.length > 0 && grantable.every((p) => selected.has(p))}
                    ref={(el) => {
                      if (!el) return
                      const someEnabled = grantable.some((p) => selected.has(p))
                      el.indeterminate =
                        someEnabled && !grantable.every((p) => selected.has(p))
                    }}
                    onChange={(e) => toggleAllPermissions(e.target.checked)}
                    aria-label={t('selectAllGlobal')}
                  />
                  <span className="font-medium">{t('selectAllGlobal')}</span>
                </label>

                <div className="relative w-full max-w-[390px]">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
                    aria-hidden
                  />
                  <Input
                    id={searchId}
                    value={permSearch}
                    onChange={(e) => setPermSearch(e.target.value)}
                    placeholder={t('searchPlaceholder')}
                    className="h-10 rounded-xl border-dash-border bg-canvas pl-9 text-sm"
                    aria-label={t('searchPlaceholder')}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
                {groups.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-dash-border px-3 py-6 text-center text-sm text-body xl:col-span-2">
                    {t('noGrantable')}
                  </p>
                ) : filteredGroups.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-dash-border px-3 py-6 text-center text-sm text-body xl:col-span-2">
                    {t('searchNoMatches')}
                  </p>
                ) : (
                  <>
                    <div className="rounded-xl border border-dash-border bg-canvas p-2">
                      <p className="px-2 pb-1.5 text-xs font-semibold tracking-wide text-mute uppercase">
                        {t('modules')}
                      </p>
                      <div className="space-y-1">
                        {filteredGroups.map((group) => {
                          const enabledInGroup = group.permissions.filter((p) =>
                            selected.has(p)
                          ).length
                          const active = group.resource === openResource
                          return (
                            <button
                              key={group.resource}
                              type="button"
                              onClick={() => setOpenResource(group.resource)}
                              className={cn(
                                'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm',
                                'transition-colors hover:bg-dash-surface/60',
                                active && 'bg-primary text-white hover:bg-primary'
                              )}
                            >
                              <span className="min-w-0 truncate font-medium">
                                {resourceLabel(group.resource)}
                              </span>
                              <span
                                className={cn(
                                  'rounded-md px-1.5 py-0.5 text-[11px] tabular-nums',
                                  active
                                    ? 'bg-white/20 text-white'
                                    : 'bg-dash-surface text-body'
                                )}
                              >
                                {enabledInGroup}/{group.permissions.length}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {(() => {
                      const activeGroup =
                        filteredGroups.find((group) => group.resource === openResource) ??
                        filteredGroups[0]
                      if (!activeGroup) return null

                      const allChecked = activeGroup.permissions.every((p) => selected.has(p))
                      const someChecked = activeGroup.permissions.some((p) => selected.has(p))
                      const enabledInGroup = activeGroup.permissions.filter((p) =>
                        selected.has(p)
                      ).length

                      return (
                        <div className="overflow-hidden rounded-xl border border-dash-border bg-canvas">
                          <div className="border-b border-dash-border bg-dash-surface/40 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-base font-semibold text-ink">
                                  {resourceLabel(activeGroup.resource)}
                                </p>
                                <p className="text-xs text-mute">
                                  {t('groupEnabledSummary', {
                                    enabled: enabledInGroup,
                                    total: activeGroup.permissions.length,
                                  })}
                                </p>
                              </div>
                              <label className="inline-flex items-center gap-2 text-xs font-medium text-ink">
                                <input
                                  type="checkbox"
                                  className="size-4 rounded border-dash-border"
                                  checked={allChecked}
                                  ref={(el) => {
                                    if (el) el.indeterminate = !allChecked && someChecked
                                  }}
                                  onChange={(e) =>
                                    toggleGroup(activeGroup.permissions, e.target.checked)
                                  }
                                  aria-label={t('selectGroup', { resource: activeGroup.resource })}
                                />
                                {t('selectAllInModule')}
                              </label>
                            </div>
                          </div>

                          <div className="divide-y divide-[#F1F5F9]">
                            {activeGroup.permissions.map((permission) => {
                              const checked = selected.has(permission)
                              return (
                                <button
                                  key={permission}
                                  type="button"
                                  className={cn(
                                    'flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm',
                                    'transition-colors hover:bg-dash-surface/70',
                                    'focus-visible:bg-dash-surface/80 focus-visible:outline-none',
                                    checked && 'bg-primary-pale/30'
                                  )}
                                  onClick={() => togglePermission(permission)}
                                >
                                  <span
                                    className={cn(
                                      'inline-flex size-4 shrink-0 items-center justify-center rounded border',
                                      checked
                                        ? 'border-primary bg-primary text-white'
                                        : 'border-dash-border bg-canvas'
                                    )}
                                  >
                                    {checked ? <Check className="size-3" aria-hidden /> : null}
                                  </span>
                                  <span className="min-w-0 flex-1 font-medium text-ink">
                                    {actionLabel(permission)}
                                  </span>
                                  <span className="font-mono text-[11px] text-mute">
                                    {permission}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )}
              </div>

              {permsError ? <FieldError>{permsError}</FieldError> : null}
            </Field>
          </FieldGroup>

          {error ? (
            <p id={formErrorId} role="alert" className="text-sm text-negative">
              {error}
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            'sticky bottom-0 z-10 -mx-4 border-t border-dash-border bg-canvas/95 px-4 py-3.5 backdrop-blur-sm',
            'shadow-[0_-10px_28px_rgb(15_23_42/0.06)]',
            'sm:-mx-5 sm:px-5 md:-mx-6 md:px-6'
          )}
        >
          <div className="flex flex-col gap-3">
            {/* Audit reason input is temporarily disabled. */}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-h-5">
                {dirty ? (
                  <p className="text-xs font-medium text-mute">{t('unsavedChanges')}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={requestCancel}
                >
                  {t('cancel')}
                </Button>
                <Button type="submit" disabled={saveDisabled} className="gap-2">
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      {t('saving')}
                    </>
                  ) : (
                    <>
                      <Shield className="size-4" aria-hidden />
                      {mode === 'create' ? t('createSubmit') : t('editSubmit')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </DashboardPanel>
    </div>
  )
}

