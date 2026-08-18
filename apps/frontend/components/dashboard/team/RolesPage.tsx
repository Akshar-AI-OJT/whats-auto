'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Plus, RefreshCw, Shield, Trash2 } from 'lucide-react'
import {
  api,
  type ApiError,
  type OrganizationRole,
} from '@/lib/api'
import { PRODUCT_PERMISSIONS } from '@/lib/product-permissions'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import {
  PermissionBadges,
} from '@/components/dashboard/team/RoleEditorSheet'
import { useRouter } from '@/i18n/navigation'

function unwrapList<T>(data: { data?: T[] } | T[] | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.data)) return data.data
  return []
}

export function RolesPage() {
  const t = useTranslations('dashboard.roles')
  const router = useRouter()
  const deleteTitleId = useId()
  const deleteDescId = useId()
  const resetTitleId = useId()
  const resetDescId = useId()
  const {
    tenantOrganizationId,
    canViewRoles,
    canManageRoles,
    isLoading: orgsLoading,
  } = useOrganizations()

  const [roles, setRoles] = useState<OrganizationRole[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<OrganizationRole | null>(null)
  const [replacementRole, setReplacementRole] = useState('viewer')
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  const [resetTarget, setResetTarget] = useState<OrganizationRole | null>(null)
  const [resetReason, setResetReason] = useState('')
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetPending, setResetPending] = useState(false)

  const organizationIdRef = useRef(tenantOrganizationId)
  organizationIdRef.current = tenantOrganizationId

  const loadRoles = useCallback(
    async (organizationId: string) => {
      if (!canViewRoles) {
        setRoles([])
        setListLoading(false)
        return
      }

      setListLoading(true)
      setListError(null)
      try {
        const { data } = await api.roles.list()
        if (organizationId !== organizationIdRef.current) return
        setRoles(unwrapList(data))
      } catch (err) {
        if (organizationId !== organizationIdRef.current) return
        setRoles([])
        const apiError = err as ApiError
        setListError(apiError.message || t('errors.loadFailed'))
      } finally {
        if (organizationId === organizationIdRef.current) {
          setListLoading(false)
        }
      }
    },
    [canViewRoles, t]
  )

  useEffect(() => {
    if (orgsLoading) return
    if (!tenantOrganizationId) {
      setRoles([])
      setListLoading(true)
      return
    }
    void loadRoles(tenantOrganizationId)
  }, [orgsLoading, tenantOrganizationId, loadRoles])

  function mapActionError(err: unknown): string {
    const apiError = err as ApiError
    if (apiError.status === 401) return t('errors.sessionExpired')
    if (apiError.status === 403 || apiError.code === 'PERMISSION_DENIED') {
      return t('errors.actionPermissionDenied')
    }
    if (apiError.code === 'E_PERMISSION_ESCALATION') return t('errors.escalation')
    if (apiError.code === 'E_ROLE_PROTECTED') return t('errors.protected')
    if (apiError.code === 'E_ROLE_RESET_CUSTOM') return t('errors.resetCustom')
    if (apiError.code === 'E_ROLE_REPLACEMENT_MISSING') return t('errors.replacementMissing')
    return apiError.message || t('errors.actionFailed')
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || !canManageRoles) return
    if (deleteReason.trim().length < 5) {
      setDeleteError(t('delete.reasonRequired'))
      return
    }
    if (!replacementRole.trim()) {
      setDeleteError(t('delete.replacementRequired'))
      return
    }

    setDeletePending(true)
    setDeleteError(null)
    try {
      await api.roles.destroy(deleteTarget.role, {
        replacementRole: replacementRole.trim(),
        reason: deleteReason.trim(),
      })
      setDeleteTarget(null)
      setDeleteReason('')
      setActionError(null)
      if (tenantOrganizationId) void loadRoles(tenantOrganizationId)
    } catch (err) {
      setDeleteError(mapActionError(err))
    } finally {
      setDeletePending(false)
    }
  }

  async function handleResetConfirm() {
    if (!resetTarget || !canManageRoles) return
    if (resetReason.trim().length < 5) {
      setResetError(t('reset.reasonRequired'))
      return
    }

    setResetPending(true)
    setResetError(null)
    try {
      await api.roles.reset(resetTarget.role, { reason: resetReason.trim() })
      setResetTarget(null)
      setResetReason('')
      setActionError(null)
      if (tenantOrganizationId) void loadRoles(tenantOrganizationId)
    } catch (err) {
      setResetError(mapActionError(err))
    } finally {
      setResetPending(false)
    }
  }

  const replacementOptions = roles
    .filter((r) => r.role !== deleteTarget?.role)
    .map((r) => r.role)

  if (!orgsLoading && !canViewRoles) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
        <DashboardPanel as="section" className="px-4 py-5 sm:px-6 sm:py-6">
          <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
            {t('title')}
          </h1>
          <div
            role="alert"
            className="mt-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink"
          >
            {t('errors.permissionDenied')}
          </div>
        </DashboardPanel>
      </div>
    )
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      <DashboardPanel
        as="section"
        className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
      >
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
              {t('eyebrow')}
            </p>
            <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-body sm:text-base sm:leading-7">
              {t('subtitle')}
            </p>
          </div>
          {canManageRoles ? (
            <Button
              type="button"
              className="shrink-0 gap-2"
              onClick={() => router.push('/dashboard/team/roles/create')}
            >
              <Plus className="size-4" aria-hidden />
              {t('createCta')}
            </Button>
          ) : null}
        </div>
      </DashboardPanel>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader title={t('listTitle')} description={t('listDescription')} />

        {actionError ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
          >
            {actionError}
          </div>
        ) : null}

        {listLoading || orgsLoading ? (
          <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : listError ? (
          <div
            role="alert"
            className="mt-8 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
          >
            {listError}
          </div>
        ) : roles.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border bg-dash-surface/50 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
              <Shield className="size-5" aria-hidden />
            </span>
            <p className="font-medium text-ink">{t('emptyTitle')}</p>
            <p className="max-w-sm text-sm text-body">{t('emptyDescription')}</p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-dash-border overflow-hidden rounded-2xl border border-dash-border">
            {roles.map((role) => (
              <li
                key={role.role}
                className="flex flex-col gap-3 bg-canvas px-4 py-4 sm:px-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-semibold text-ink">{role.role}</p>
                      {role.isSystem ? (
                        <span className="rounded-md bg-primary-pale px-2 py-0.5 text-[11px] font-semibold tracking-wide text-positive-deep uppercase">
                          {t('badgeSystem')}
                        </span>
                      ) : (
                        <span className="rounded-md bg-dash-surface px-2 py-0.5 text-[11px] font-semibold tracking-wide text-body uppercase">
                          {t('badgeCustom')}
                        </span>
                      )}
                      {role.hasOverrides ? (
                        <span className="rounded-md bg-warning/15 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-ink uppercase">
                          {t('badgeOverrides')}
                        </span>
                      ) : null}
                    </div>
                    <PermissionBadges
                      permissions={role.permissions}
                      total={PRODUCT_PERMISSIONS.length}
                      className="mt-2"
                    />
                  </div>

                  {canManageRoles ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2 self-end sm:self-start">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          router.push(`/dashboard/team/roles/edit/${role.role}`)
                        }
                      >
                        {t('editCta')}
                      </Button>
                      {role.isSystem && role.hasOverrides ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            setResetError(null)
                            setResetReason('')
                            setResetTarget(role)
                          }}
                        >
                          <RefreshCw className="size-3.5" aria-hidden />
                          {t('resetCta')}
                        </Button>
                      ) : null}
                      {!role.isSystem ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-9 border-negative/30 text-negative hover:bg-negative/5 hover:text-negative"
                          aria-label={t('deleteAria', { role: role.role })}
                          onClick={() => {
                            setDeleteError(null)
                            setDeleteReason('')
                            setReplacementRole(
                              replacementOptions.includes('viewer')
                                ? 'viewer'
                                : (replacementOptions[0] ?? 'agent')
                            )
                            setDeleteTarget(role)
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DashboardPanel>

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!deletePending) setDeleteTarget(null)
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={deleteTitleId}
            aria-describedby={deleteDescId}
            className="w-full max-w-md rounded-2xl border border-dash-border bg-canvas p-5 shadow-[0_20px_50px_rgb(15_23_42/0.18)] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={deleteTitleId} className="font-display text-lg tracking-tight text-ink">
              {t('delete.title')}
            </h2>
            <p id={deleteDescId} className="mt-2 text-sm leading-6 text-body">
              {t('delete.body', { role: deleteTarget.role })}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold tracking-wide text-mute uppercase">
                  {t('delete.replacement')}
                </label>
                <select
                  className="mt-1.5 h-10 w-full rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30"
                  value={replacementRole}
                  onChange={(e) => setReplacementRole(e.target.value)}
                >
                  {replacementOptions.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold tracking-wide text-mute uppercase">
                  {t('delete.reason')}
                </label>
                <Input
                  className="mt-1.5"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder={t('delete.reasonPlaceholder')}
                />
              </div>
            </div>

            {deleteError ? (
              <p role="alert" className="mt-3 text-sm text-negative">
                {deleteError}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={deletePending}
                onClick={() => setDeleteTarget(null)}
              >
                {t('delete.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deletePending}
                className="gap-2"
                onClick={() => {
                  void handleDeleteConfirm()
                }}
              >
                {deletePending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('delete.deleting')}
                  </>
                ) : (
                  t('delete.confirm')
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {resetTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!resetPending) setResetTarget(null)
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={resetTitleId}
            aria-describedby={resetDescId}
            className="w-full max-w-md rounded-2xl border border-dash-border bg-canvas p-5 shadow-[0_20px_50px_rgb(15_23_42/0.18)] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={resetTitleId} className="font-display text-lg tracking-tight text-ink">
              {t('reset.title')}
            </h2>
            <p id={resetDescId} className="mt-2 text-sm leading-6 text-body">
              {t('reset.body', { role: resetTarget.role })}
            </p>

            <div className="mt-4">
              <label className="text-xs font-semibold tracking-wide text-mute uppercase">
                {t('reset.reason')}
              </label>
              <Input
                className="mt-1.5"
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                placeholder={t('reset.reasonPlaceholder')}
              />
            </div>

            {resetError ? (
              <p role="alert" className="mt-3 text-sm text-negative">
                {resetError}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={resetPending}
                onClick={() => setResetTarget(null)}
              >
                {t('reset.cancel')}
              </Button>
              <Button
                type="button"
                disabled={resetPending}
                className="gap-2"
                onClick={() => {
                  void handleResetConfirm()
                }}
              >
                {resetPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('reset.resetting')}
                  </>
                ) : (
                  t('reset.confirm')
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
