'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, Info, Loader2, Search, Shield } from 'lucide-react'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const BADGE_PREVIEW_COUNT = 6

type RoleEditorSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  role?: OrganizationRole | null
  onSaved?: () => void
}

function slugPreview(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20)
}

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

export function RoleEditorSheet({
  open,
  onOpenChange,
  mode,
  role,
  onSaved,
}: RoleEditorSheetProps) {
  const t = useTranslations('dashboard.roles.editor')
  const { accessContext, canManageRoles, tenantOrganizationId } = useOrganizations()
  const nameId = useId()
  const reasonId = useId()
  const searchId = useId()
  const formErrorId = useId()

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
  const [reason, setReason] = useState('')
  const [permSearch, setPermSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [nameError, setNameError] = useState<string | null>(null)
  const [permsError, setPermsError] = useState<string | null>(null)
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setNameError(null)
    setPermsError(null)
    setReasonError(null)
    setPending(false)
    setReason('')
    setPermSearch('')
    setCollapsed({})
    if (mode === 'edit' && role) {
      const next = new Set(
        role.permissions.filter((p) => grantable.includes(p as ProductPermission))
      )
      setName(role.role)
      setSelected(next)
      setInitialSelected(new Set(next))
    } else {
      setName('')
      setSelected(new Set())
      setInitialSelected(new Set())
    }
  }, [open, mode, role, grantable])

  const dirty = useMemo(() => {
    if (mode === 'create') {
      return name.trim().length > 0 || selected.size > 0
    }
    return !setsEqual(selected, initialSelected) || reason.trim().length > 0
  }, [mode, name, selected, initialSelected, reason])

  const filteredGroups = useMemo(() => {
    const q = permSearch.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter(
          (permission) =>
            permission.toLowerCase().includes(q) ||
            group.resource.toLowerCase().includes(q)
        ),
      }))
      .filter((group) => group.permissions.length > 0)
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

  function requestClose(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true)
      return
    }
    if (pending) return
    if (dirty) {
      const confirmed = window.confirm(t('unsavedConfirm'))
      if (!confirmed) return
    }
    onOpenChange(false)
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNameError(null)
    setPermsError(null)
    setReasonError(null)

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
      if (reason.trim().length < 5) {
        setReasonError(t('errors.reasonRequired'))
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
          reason: reason.trim(),
        })
      }
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      setError(mapError(err as ApiError))
    } finally {
      setPending(false)
    }
  }

  const title = mode === 'create' ? t('createTitle') : t('editTitle', { role: role?.role ?? '' })
  const subtitle = mode === 'create' ? t('createSubtitle') : t('editSubtitle')
  const keyHint = mode === 'create' ? slugPreview(name) : role?.role
  const showSystemBanner = mode === 'edit' && Boolean(role?.isSystem)
  const saveDisabled = pending || !canManageRoles || !dirty

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        size="fullscreen"
        className="gap-0 overflow-hidden p-0"
        showCloseButton
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <DialogHeader className="shrink-0 border-b border-dash-border pr-12">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{subtitle}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
            <FieldGroup className="gap-4">
              {mode === 'create' ? (
                <Field data-invalid={Boolean(nameError)} className="max-w-md">
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
                <div className="max-w-md rounded-xl border border-dash-border bg-dash-surface/60 px-3 py-2.5">
                  <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('roleKey')}
                  </p>
                  <p className="mt-1 font-mono text-sm text-ink">{role?.role}</p>
                </div>
              )}

              {showSystemBanner ? (
                <div
                  role="status"
                  className="flex gap-2.5 rounded-xl border border-warning/35 bg-warning/10 px-3 py-3 text-sm text-ink"
                >
                  <Info className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden />
                  <p>{t('systemOverrideBanner')}</p>
                </div>
              ) : null}

              <Field data-invalid={Boolean(permsError)}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <FieldLabel>{t('permissions')}</FieldLabel>
                    <FieldDescription>{t('permissionsHint')}</FieldDescription>
                  </div>
                  <p className="shrink-0 text-xs font-medium text-mute tabular-nums">
                    {t('enabledTotal', {
                      enabled: selected.size,
                      total: grantable.length,
                    })}
                  </p>
                </div>

                <div className="relative mt-3 max-w-md">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
                    aria-hidden
                  />
                  <Input
                    id={searchId}
                    value={permSearch}
                    onChange={(e) => setPermSearch(e.target.value)}
                    placeholder={t('searchPlaceholder')}
                    className="h-10 rounded-xl border-dash-border bg-canvas pl-9"
                    aria-label={t('searchPlaceholder')}
                  />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {groups.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-dash-border px-3 py-6 text-center text-sm text-body sm:col-span-2 xl:col-span-3">
                      {t('noGrantable')}
                    </p>
                  ) : filteredGroups.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-dash-border px-3 py-6 text-center text-sm text-body sm:col-span-2 xl:col-span-3">
                      {t('searchNoMatches')}
                    </p>
                  ) : (
                    filteredGroups.map((group) => {
                      const isCollapsed = collapsed[group.resource] === true
                      const allChecked = group.permissions.every((p) => selected.has(p))
                      const someChecked = group.permissions.some((p) => selected.has(p))
                      const enabledInGroup = group.permissions.filter((p) =>
                        selected.has(p)
                      ).length

                      return (
                        <div
                          key={group.resource}
                          className="flex flex-col overflow-hidden rounded-xl border border-dash-border bg-canvas"
                        >
                          <div className="flex items-center gap-2 border-b border-dash-border bg-dash-surface/50 px-3 py-2">
                            <input
                              type="checkbox"
                              className="size-4 rounded border-dash-border"
                              checked={allChecked}
                              ref={(el) => {
                                if (el) el.indeterminate = !allChecked && someChecked
                              }}
                              onChange={(e) =>
                                toggleGroup(group.permissions, e.target.checked)
                              }
                              aria-label={t('selectGroup', { resource: group.resource })}
                            />
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              onClick={() =>
                                setCollapsed((prev) => ({
                                  ...prev,
                                  [group.resource]: !isCollapsed,
                                }))
                              }
                              aria-expanded={!isCollapsed}
                            >
                              <span className="min-w-0 flex-1 text-sm font-semibold capitalize text-ink">
                                {group.resource}
                              </span>
                              <span className="text-[11px] tabular-nums text-mute">
                                {enabledInGroup}/{group.permissions.length}
                              </span>
                              <ChevronDown
                                className={cn(
                                  'size-4 shrink-0 text-mute transition-transform duration-200',
                                  isCollapsed && '-rotate-90'
                                )}
                                aria-hidden
                              />
                            </button>
                          </div>

                          {!isCollapsed ? (
                            <div className="grid gap-1 p-2.5">
                              {group.permissions.map((permission) => (
                                <label
                                  key={permission}
                                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs text-body hover:bg-dash-surface/60"
                                >
                                  <input
                                    type="checkbox"
                                    className="size-3.5 shrink-0 rounded border-dash-border"
                                    checked={selected.has(permission)}
                                    onChange={() => togglePermission(permission)}
                                  />
                                  <span className="break-all font-mono">{permission}</span>
                                </label>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
                {permsError ? <FieldError>{permsError}</FieldError> : null}
              </Field>

              {error ? (
                <p id={formErrorId} role="alert" className="text-sm text-negative">
                  {error}
                </p>
              ) : null}
            </FieldGroup>
          </div>

          <DialogFooter className="shrink-0 border-t border-dash-border bg-canvas sm:flex-col sm:items-stretch">
            {mode === 'edit' ? (
              <Field data-invalid={Boolean(reasonError)} className="gap-1.5">
                <FieldLabel htmlFor={reasonId}>{t('reason')}</FieldLabel>
                <Input
                  id={reasonId}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('reasonPlaceholder')}
                  aria-invalid={Boolean(reasonError)}
                />
                <FieldDescription>{t('reasonHint')}</FieldDescription>
                {reasonError ? <FieldError>{reasonError}</FieldError> : null}
              </Field>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => requestClose(false)}
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function PermissionBadges({
  permissions,
  total,
  className,
}: {
  permissions: string[]
  /** Catalog size for enabled/total display. Defaults to product permission count. */
  total?: number
  className?: string
}) {
  const t = useTranslations('dashboard.roles')
  const [expanded, setExpanded] = useState(false)
  const catalogTotal = total ?? PRODUCT_PERMISSIONS.length
  const shown = expanded ? permissions : permissions.slice(0, BADGE_PREVIEW_COUNT)
  const rest = permissions.length - BADGE_PREVIEW_COUNT

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs font-medium text-mute tabular-nums">
        {t('permissionCountRatio', {
          enabled: permissions.length,
          total: catalogTotal,
        })}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((permission) => (
          <span
            key={permission}
            className="rounded-md bg-dash-surface px-2 py-0.5 font-mono text-[11px] text-body"
          >
            {permission}
          </span>
        ))}
        {!expanded && rest > 0 ? (
          <button
            type="button"
            className="rounded-md bg-dash-surface px-2 py-0.5 text-[11px] font-medium text-positive-deep transition-colors hover:bg-primary-pale"
            onClick={() => setExpanded(true)}
          >
            {t('morePermissions', { count: rest })}
          </button>
        ) : null}
        {expanded && permissions.length > BADGE_PREVIEW_COUNT ? (
          <button
            type="button"
            className="rounded-md bg-dash-surface px-2 py-0.5 text-[11px] font-medium text-body transition-colors hover:bg-primary-pale"
            onClick={() => setExpanded(false)}
          >
            {t('showLess')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
