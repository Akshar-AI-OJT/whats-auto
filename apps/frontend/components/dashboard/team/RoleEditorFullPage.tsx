/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Check,
  ChevronRight,
  Headset,
  Info,
  Loader2,
  Search,
  Settings2,
  Shield,
  Users,
} from 'lucide-react'
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
import { Link } from '@/i18n/navigation'
import {
  actionLabel,
  crudColumnForPermission,
  grantablePreset,
  matchingTemplate,
  resourceLabel,
  setsEqual,
  sortPermissions,
  sortResources,
  type CrudColumn,
  type RoleTemplateId,
} from './role-editor-utils'

const MODULE_DESCRIPTION_KEYS = new Set([
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
  'media',
])

const CRUD_COLUMNS: CrudColumn[] = ['view', 'create', 'update', 'delete']

const TEMPLATE_ICONS: Record<RoleTemplateId, typeof Shield> = {
  admin: Shield,
  manager: Users,
  agent: Headset,
  custom: Settings2,
}

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

function RadioDot({
  checked,
  disabled,
}: {
  checked: boolean
  disabled?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex size-4 items-center justify-center rounded-full border',
        checked
          ? 'border-primary bg-primary'
          : 'border-dash-border bg-canvas',
        disabled && !checked && 'opacity-30'
      )}
    >
      {checked ? <span className="size-1.5 rounded-full bg-on-primary" /> : null}
    </span>
  )
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
  const descriptionId = useId()
  const searchId = useId()
  const formErrorId = useId()
  const didInitCreate = useRef(false)

  const [role, setRole] = useState<OrganizationRole | null>(null)
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
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [initialSelected, setInitialSelected] = useState<Set<string>>(new Set())
  const [permSearch, setPermSearch] = useState('')
  const [openResource, setOpenResource] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [permsError, setPermsError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const activeTemplate = useMemo(
    () => matchingTemplate(selected, grantable),
    [selected, grantable]
  )

  const dirty = useMemo(() => {
    if (mode === 'create') {
      return (
        name.trim().length > 0 ||
        description.trim().length > 0 ||
        !setsEqual(selected, initialSelected)
      )
    }
    return !setsEqual(selected, initialSelected)
  }, [mode, name, description, selected, initialSelected])

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
                resourceLabel(group.resource).toLowerCase().includes(q) ||
                actionLabel(permission).toLowerCase().includes(q)
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

    const normalized = [...merged.values()].map((group) => ({
      resource: group.resource,
      permissions: sortPermissions(group.permissions),
    }))

    return sortResources(normalized)
  }, [groups, permSearch])

  function togglePermission(permission: string, enabled: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (enabled) next.add(permission)
      else next.delete(permission)
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

  function applyTemplate(template: RoleTemplateId) {
    if (template === 'custom') return
    setSelected(new Set(grantablePreset(template, grantable)))
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
    } else if (!role) {
      setError(t('errors.generic'))
      return
    }

    setPending(true)
    try {
      if (mode === 'create') {
        await api.roles.create({ name: name.trim(), permissions })
      } else if (role) {
        await api.roles.update(role.role, {
          permissions,
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
    setError(null)
    setNameError(null)
    setPermsError(null)
    setPending(false)
    setPermSearch('')
    setOpenResource(null)
    setDescription('')
    didInitCreate.current = false

    if (mode === 'create') {
      setRole(null)
      setName('')
      setSelected(new Set())
      setInitialSelected(new Set())
      return
    }

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
        setRoleLoadError((err as ApiError).message || tRoles('errors.loadFailed'))
      })
      .finally(() => {
        setRoleLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, roleKey])

  useEffect(() => {
    if (mode !== 'create') return
    if (didInitCreate.current) return
    if (grantable.length === 0) return
    const preset = new Set(grantablePreset('admin', grantable))
    setSelected(preset)
    setInitialSelected(preset)
    didInitCreate.current = true
  }, [mode, grantable])

  useEffect(() => {
    if (mode !== 'edit') return
    if (!role) return
    const nextSelected = new Set(
      role.permissions.filter((p) => grantable.includes(p as ProductPermission))
    )
    setSelected(nextSelected)
    setInitialSelected(new Set(nextSelected))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantable])

  // Derive the visible resource accordion: auto-select the first group when the
  // stored openResource is filtered out, without a useEffect.
  const activeResource: string | null =
    filteredGroups.length === 0
      ? null
      : openResource && filteredGroups.some((g) => g.resource === openResource)
        ? openResource
        : filteredGroups[0]!.resource

  const title =
    mode === 'create'
      ? t('createTitle')
      : t('editTitle', { role: (role?.role ?? '').toUpperCase() })
  const subtitle = mode === 'create' ? t('createSubtitle') : t('editSubtitle')
  const keyHint = mode === 'create' ? slugPreview(name) : role?.role
  const saveDisabled = pending || !canManageRoles || !dirty

  const headerActions = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
      <Button type="button" variant="outline" disabled={pending} onClick={requestCancel}>
        {t('cancel')}
      </Button>
      <Button type="submit" disabled={saveDisabled} className="gap-2">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('saving')}
          </>
        ) : (
          t(mode === 'create' ? 'createSubmit' : 'editSubmit')
        )}
      </Button>
    </div>
  )

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

  const activeGroup =
    filteredGroups.find((group) => group.resource === activeResource) ?? filteredGroups[0]
  const enabledInActive = activeGroup
    ? activeGroup.permissions.filter((p) => selected.has(p)).length
    : 0
  const allActiveChecked = Boolean(
    activeGroup && activeGroup.permissions.every((p) => selected.has(p))
  )
  const someActiveChecked = Boolean(
    activeGroup && activeGroup.permissions.some((p) => selected.has(p))
  )

  return (
    <div className="w-full min-w-0">
      <form
        className="flex min-w-0 flex-col gap-5"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={pending}
        aria-describedby={error ? formErrorId : undefined}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-mute">
              <Link
                href="/dashboard/team/roles"
                className="hover:text-ink"
              >
                {t('breadcrumb')}
              </Link>
              <ChevronRight className="size-3.5 shrink-0" aria-hidden />
              <span className="text-ink">{title}</span>
            </nav>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
            <p className="mt-1 max-w-2xl text-sm leading-6 text-body">{subtitle}</p>
          </div>
          {headerActions}
        </div>

        <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <FieldGroup className="gap-5">
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
                {t('detailsTitle')}
              </h2>
              {mode === 'create' ? (
                <>
                  <Field data-invalid={Boolean(nameError)} className="gap-2">
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
                  <Field className="gap-2">
                    <FieldLabel htmlFor={descriptionId}>{t('description')}</FieldLabel>
                    <textarea
                      id={descriptionId}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('descriptionPlaceholder')}
                      rows={4}
                      className={cn(
                        'w-full min-w-0 rounded-md border border-ink bg-canvas px-4 py-3 text-base leading-5 text-ink shadow-none outline-none',
                        'placeholder:text-mute hover:border-body',
                        'focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-primary/50'
                      )}
                    />
                    <FieldDescription>{t('descriptionHint')}</FieldDescription>
                  </Field>
                </>
              ) : (
                <div className="rounded-xl border border-dash-border bg-dash-surface/60 px-3 py-2">
                  <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('roleKey')}
                  </p>
                  <p className="mt-1 font-mono text-sm text-ink">
                    {(role?.role ?? '').toUpperCase()}
                  </p>
                </div>
              )}
            </FieldGroup>

            <div>
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
                {t('quickSetupTitle')}
              </h2>
              <p className="mt-0.5 text-sm text-mute">{t('quickSetupHint')}</p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(['admin', 'manager', 'agent', 'custom'] as const).map((id) => {
                  const Icon = TEMPLATE_ICONS[id]
                  const selectedTemplate = activeTemplate === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => applyTemplate(id)}
                      className={cn(
                        'flex items-start gap-3 rounded-2xl border px-3.5 py-3.5 text-left transition-colors',
                        selectedTemplate
                          ? 'border-primary bg-primary-pale/40 shadow-[0_0_0_1px_rgb(159_232_112/0.25)]'
                          : 'border-dash-border bg-canvas hover:bg-dash-surface/60'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl',
                          selectedTemplate
                            ? 'bg-primary text-on-primary'
                            : 'bg-dash-surface text-positive-deep'
                        )}
                      >
                        {selectedTemplate ? (
                          <Check className="size-4" aria-hidden />
                        ) : (
                          <Icon className="size-4" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">
                          {t(`templates.${id}.name`)}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-body">
                          {t(`templates.${id}.description`)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </DashboardPanel>

        <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
                {t('permissions')}
              </h2>
              <p className="mt-0.5 text-sm text-mute">{t('permissionsHint')}</p>
            </div>
            <p className="shrink-0 text-right text-[11px] font-medium text-mute tabular-nums">
              {t('enabledTotal', { enabled: selected.size, total: grantable.length })}
            </p>
          </div>

          {groups.length === 0 ? (
            <p className="mt-5 rounded-xl border border-dashed border-dash-border px-3 py-6 text-center text-sm text-body">
              {t('noGrantable')}
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-1 overflow-hidden rounded-2xl border border-dash-border xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="border-b border-dash-border bg-canvas p-3 xl:border-r xl:border-b-0">
                <div className="relative">
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
                {filteredGroups.length === 0 ? (
                  <p className="mt-4 px-1 text-sm text-body">{t('searchNoMatches')}</p>
                ) : (
                  <div className="mt-3 space-y-1">
                    {filteredGroups.map((group) => {
                      const enabledInGroup = group.permissions.filter((p) =>
                        selected.has(p)
                      ).length
                      const active = group.resource === activeResource
                      return (
                        <button
                          key={group.resource}
                          type="button"
                          onClick={() => setOpenResource(group.resource)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm',
                            'transition-colors hover:bg-dash-surface/60',
                            active && 'bg-primary-pale text-positive-deep hover:bg-primary-pale'
                          )}
                        >
                          <span className="min-w-0 truncate font-medium">
                            {resourceLabel(group.resource)}
                          </span>
                          <span
                            className={cn(
                              'rounded-md px-1.5 py-0.5 text-[11px] tabular-nums',
                              active
                                ? 'bg-primary/20 text-positive-deep'
                                : 'bg-dash-surface text-body'
                            )}
                          >
                            {enabledInGroup}/{group.permissions.length}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {activeGroup ? (
                <div className="min-w-0 bg-canvas">
                  <div className="flex flex-col gap-3 border-b border-dash-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-ink">
                        {resourceLabel(activeGroup.resource)}
                      </p>
                      <p className="text-xs text-mute">
                        {MODULE_DESCRIPTION_KEYS.has(activeGroup.resource)
                          ? t(`moduleDescriptions.${activeGroup.resource}`)
                          : t('groupEnabledSummary', {
                              enabled: enabledInActive,
                              total: activeGroup.permissions.length,
                            })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-medium text-mute tabular-nums">
                        {t('groupEnabledSummary', {
                          enabled: enabledInActive,
                          total: activeGroup.permissions.length,
                        })}
                      </p>
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-ink">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-dash-border"
                          checked={allActiveChecked}
                          ref={(el) => {
                            if (el) el.indeterminate = !allActiveChecked && someActiveChecked
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

                  <div className="overflow-x-auto">
                    <table className="min-w-[40rem] w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-dash-border text-[11px] font-semibold tracking-wide text-mute uppercase">
                          <th className="px-4 py-2.5 text-left font-semibold">
                            {t('columns.permission')}
                          </th>
                          <th className="px-2 py-2.5 text-center font-semibold">
                            {t('columns.noAccess')}
                          </th>
                          {CRUD_COLUMNS.map((column) => (
                            <th key={column} className="px-2 py-2.5 text-center font-semibold">
                              {t(`columns.${column}`)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeGroup.permissions.map((permission) => {
                          const granted = selected.has(permission)
                          const mapped = crudColumnForPermission(permission)
                          return (
                            <tr
                              key={permission}
                              className="border-b border-dash-border last:border-b-0"
                            >
                              <td className="px-4 py-3">
                                <p className="font-medium text-ink">{actionLabel(permission)}</p>
                                <p className="font-mono text-[11px] text-mute">{permission}</p>
                              </td>
                              <td className="px-2 py-3 text-center">
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center rounded-full p-1"
                                  aria-label={t('columns.noAccess')}
                                  aria-pressed={!granted}
                                  onClick={() => togglePermission(permission, false)}
                                >
                                  <RadioDot checked={!granted} />
                                </button>
                              </td>
                              {CRUD_COLUMNS.map((column) => {
                                const applicable = column === mapped
                                const checked = granted && applicable
                                return (
                                  <td key={column} className="px-2 py-3 text-center">
                                    <button
                                      type="button"
                                      disabled={!applicable}
                                      className="inline-flex items-center justify-center rounded-full p-1 disabled:cursor-not-allowed"
                                      aria-label={t(`columns.${column}`)}
                                      aria-pressed={checked}
                                      onClick={() => {
                                        if (!applicable) return
                                        togglePermission(permission, true)
                                      }}
                                    >
                                      <RadioDot checked={checked} disabled={!applicable} />
                                    </button>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-start gap-3 border-t border-dash-border bg-primary-pale/30 px-4 py-3">
                    <Info className="mt-0.5 size-4 shrink-0 text-positive-deep" aria-hidden />
                    <p className="text-sm leading-6 text-body">{t('helpBanner')}</p>
                  </div>
                </div>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-body">{t('searchNoMatches')}</p>
              )}
            </div>
          )}

          {permsError ? <FieldError className="mt-3">{permsError}</FieldError> : null}
        </DashboardPanel>

        {error ? (
          <p id={formErrorId} role="alert" className="text-sm text-negative">
            {error}
          </p>
        ) : null}

        <div
          className={cn(
            'sticky bottom-0 z-10 rounded-2xl border border-dash-border bg-canvas/95 px-4 py-3.5 backdrop-blur-sm',
            'shadow-[0_-10px_28px_rgb(15_23_42/0.06)]'
          )}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-h-5">
              {dirty ? (
                <p className="text-xs font-medium text-mute">{t('unsavedChanges')}</p>
              ) : null}
            </div>
            {headerActions}
          </div>
        </div>
      </form>
    </div>
  )
}
