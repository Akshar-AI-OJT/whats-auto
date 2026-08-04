'use client'

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Loader2, Pencil, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { useRouter } from '@/i18n/navigation'
import type { OrganizationPlan, OrganizationStatus } from '../mock-data'
import {
  deleteSuperAdminOrganization,
  listSuperAdminOrganizations,
  mapOrgApiError,
  updateSuperAdminOrganization,
  type AdminOrganizationListItem,
} from './organization-api'
import {
  OrganizationActionsMenu,
  OrganizationPlanBadge,
  OrganizationStatusBadge,
  type OrganizationActionId,
} from './OrganizationActionsMenu'

type StatusFilter = 'all' | OrganizationStatus
type PlanFilter = 'all' | OrganizationPlan

const PER_PAGE = 20

const selectClassName = cn(
  'h-11 w-full min-w-0 rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

function formatCreatedDate(value: string) {
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

type EditFormState = {
  name: string
  phone: string
  website: string
  industry: string
  timezone: string
  currency: string
}

function editFormFromOrg(org: AdminOrganizationListItem): EditFormState {
  return {
    name: org.name ?? '',
    phone: org.phone ?? '',
    website: org.website ?? '',
    industry: org.industry ?? '',
    timezone: org.timezone ?? '',
    currency: org.currency ?? '',
  }
}

export function OrganizationsPage() {
  const t = useTranslations('admin.organizations')
  const router = useRouter()
  const deleteTitleId = useId()
  const deleteDescId = useId()
  const editTitleId = useId()

  const [organizations, setOrganizations] = useState<AdminOrganizationListItem[]>([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all')

  const [deleteTarget, setDeleteTarget] = useState<AdminOrganizationListItem | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [editTarget, setEditTarget] = useState<AdminOrganizationListItem | null>(null)
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [editPending, setEditPending] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const loadOrganizations = useCallback(async (nextPage: number) => {
    setListLoading(true)
    setListError(null)
    try {
      const { items, meta } = await listSuperAdminOrganizations({
        page: nextPage,
        perPage: PER_PAGE,
      })
      setOrganizations(items)
      setPage(meta?.currentPage ?? nextPage)
      setLastPage(meta?.lastPage ?? 1)
      setTotal(meta?.total ?? items.length)
    } catch (err) {
      setOrganizations([])
      setListError(mapOrgApiError(err, t('errors.loadFailed')))
    } finally {
      setListLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadOrganizations(1)
  }, [loadOrganizations])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    return organizations.filter((org) => {
      if (statusFilter !== 'all' && org.uiStatus !== statusFilter) return false
      // Plan is not returned by the list API — keep the filter control, ignore its value.
      if (!query) return true

      return (
        org.name.toLowerCase().includes(query) ||
        org.slug.toLowerCase().includes(query) ||
        org.email.toLowerCase().includes(query)
      )
    })
  }, [organizations, search, statusFilter])

  const rows = useMemo(
    () =>
      filtered.map((org) => ({
        ...org,
        initials: getInitials(org.name),
        createdLabel: formatCreatedDate(org.createdAt),
        planLabel: t('filters.plan.unavailable'),
        statusLabel: t(`filters.status.${org.uiStatus}`),
      })),
    [filtered, t]
  )

  const handleAction = useCallback(
    (action: OrganizationActionId, organization: AdminOrganizationListItem) => {
      setActionError(null)
      setActionMessage(null)

      if (action === 'view') {
        router.push(`/admin/organizations/${organization.id}`)
        return
      }

      if (action === 'edit') {
        setEditTarget(organization)
        setEditForm(editFormFromOrg(organization))
        setEditError(null)
        return
      }

      if (action === 'suspend' || action === 'activate') {
        setActionError(t('errors.actionUnavailable'))
        return
      }

      if (action === 'delete') {
        setDeleteTarget(organization)
        setDeleteError(null)
      }
    },
    [router, t]
  )

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteSuperAdminOrganization(deleteTarget.id)
      setOrganizations((prev) => prev.filter((org) => org.id !== deleteTarget.id))
      setTotal((prev) => Math.max(0, prev - 1))
      setActionMessage(t('toast.deleted', { name: deleteTarget.name }))
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(mapOrgApiError(err, t('errors.deleteFailed')))
    } finally {
      setDeletePending(false)
    }
  }

  async function handleEditSave() {
    if (!editTarget || !editForm) return
    const name = editForm.name.trim()
    if (name.length < 2) {
      setEditError(t('errors.nameRequired'))
      return
    }

    setEditPending(true)
    setEditError(null)
    try {
      const patch = {
        name,
        phone: editForm.phone.trim() || undefined,
        website: editForm.website.trim() || undefined,
        industry: editForm.industry.trim() || undefined,
        timezone: editForm.timezone.trim() || undefined,
        currency: editForm.currency.trim() || undefined,
      }
      const updated = await updateSuperAdminOrganization(editTarget.id, patch)
      setOrganizations((prev) =>
        prev.map((org) => (org.id === updated.id ? { ...org, ...updated } : org))
      )
      setActionMessage(t('toast.updated', { name: updated.name }))
      setEditTarget(null)
      setEditForm(null)
    } catch (err) {
      setEditError(mapOrgApiError(err, t('errors.updateFailed')))
    } finally {
      setEditPending(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6">
      <DashboardPanel
        as="section"
        className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-primary-pale/80 blur-[70px]"
        />
        <div className="relative">
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
      </DashboardPanel>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader
          title={t('tableTitle')}
          description={t('tableDescription', {
            count: listLoading ? total : filtered.length,
          })}
        />

        {actionMessage ? (
          <p
            role="status"
            className="mt-4 rounded-xl border border-primary/30 bg-primary-pale/50 px-4 py-3 text-sm text-positive-deep"
          >
            {actionMessage}
          </p>
        ) : null}

        {actionError ? (
          <p role="alert" className="mt-4 text-sm text-negative">
            {actionError}
          </p>
        ) : null}

        {listError ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p role="alert" className="text-sm text-negative">
              {listError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadOrganizations(page)}
            >
              {t('retry')}
            </Button>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
          <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
            <label htmlFor="org-search" className="sr-only">
              {t('searchLabel')}
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              id="org-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('searchPlaceholder')}
              className="h-11 rounded-xl border-dash-border bg-dash-surface/90 pl-10 text-sm shadow-none"
            />
          </div>

          <div className="min-w-0">
            <label htmlFor="org-status-filter" className="sr-only">
              {t('statusFilterLabel')}
            </label>
            <select
              id="org-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className={selectClassName}
            >
              <option value="all">{t('filters.status.all')}</option>
              <option value="active">{t('filters.status.active')}</option>
              <option value="trial">{t('filters.status.trial')}</option>
              <option value="suspended">{t('filters.status.suspended')}</option>
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor="org-plan-filter" className="sr-only">
              {t('planFilterLabel')}
            </label>
            <select
              id="org-plan-filter"
              value={planFilter}
              onChange={(event) => setPlanFilter(event.target.value as PlanFilter)}
              className={selectClassName}
            >
              <option value="all">{t('filters.plan.all')}</option>
              <option value="starter">{t('filters.plan.starter')}</option>
              <option value="growth">{t('filters.plan.growth')}</option>
              <option value="pro">{t('filters.plan.pro')}</option>
              <option value="enterprise">{t('filters.plan.enterprise')}</option>
            </select>
          </div>
        </div>

        {listLoading ? (
          <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="mt-5 hidden overflow-hidden rounded-2xl border border-dash-border md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-dash-border bg-dash-surface">
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink sm:px-5">
                        {t('columns.organization')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.owner')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.plan')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.status')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.members')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.created')}
                      </th>
                      <th className="px-4 py-3.5 text-right text-sm font-semibold text-ink sm:px-5">
                        {t('columns.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-5 py-12 text-center text-sm text-mute"
                        >
                          {t('empty')}
                        </td>
                      </tr>
                    ) : (
                      rows.map((org, index) => (
                        <tr
                          key={org.id}
                          className={cn(
                            'border-b border-dash-border last:border-b-0',
                            'transition-colors duration-150',
                            index % 2 === 1 && 'bg-dash-surface/60'
                          )}
                        >
                          <td className="px-4 py-3.5 sm:px-5">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-on-primary shadow-[0_4px_12px_rgb(159_232_112/0.25)]">
                                {org.initials}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-ink">
                                  {org.name}
                                </span>
                                <span className="block truncate text-xs text-mute">
                                  {org.slug}
                                </span>
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="block truncate text-sm font-medium text-ink">
                              {org.email}
                            </span>
                            <span className="block truncate text-xs text-mute">
                              {org.email}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <OrganizationPlanBadge label={org.planLabel} />
                          </td>
                          <td className="px-4 py-3.5">
                            <OrganizationStatusBadge
                              status={org.uiStatus}
                              label={org.statusLabel}
                            />
                          </td>
                          <td className="px-4 py-3.5 text-sm tabular-nums text-mute">
                            —
                          </td>
                          <td className="px-4 py-3.5 text-sm tabular-nums text-body">
                            {org.createdLabel}
                          </td>
                          <td className="px-4 py-3.5 sm:px-5">
                            <OrganizationActionsMenu
                              organization={org}
                              onAction={handleAction}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile stacked cards */}
            <ul className="mt-5 flex flex-col gap-3 md:hidden">
              {rows.length === 0 ? (
                <li className="rounded-2xl border border-dash-border bg-dash-surface/60 px-4 py-10 text-center text-sm text-mute">
                  {t('empty')}
                </li>
              ) : (
                rows.map((org) => (
                  <li key={org.id}>
                    <article
                      className={cn(
                        'rounded-2xl border border-dash-border bg-dash-surface/60 p-4',
                        'transition-colors duration-150'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-on-primary">
                            {org.initials}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{org.name}</p>
                            <p className="truncate text-xs text-mute">{org.slug}</p>
                          </div>
                        </div>
                        <OrganizationActionsMenu
                          organization={org}
                          onAction={handleAction}
                        />
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-mute">{t('columns.owner')}</dt>
                          <dd className="mt-0.5 truncate font-medium text-ink">{org.email}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-mute">{t('columns.members')}</dt>
                          <dd className="mt-0.5 tabular-nums font-medium text-mute">—</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-mute">{t('columns.plan')}</dt>
                          <dd className="mt-1">
                            <OrganizationPlanBadge label={org.planLabel} />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-mute">{t('columns.status')}</dt>
                          <dd className="mt-1">
                            <OrganizationStatusBadge
                              status={org.uiStatus}
                              label={org.statusLabel}
                            />
                          </dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-xs text-mute">{t('columns.created')}</dt>
                          <dd className="mt-0.5 text-body">{org.createdLabel}</dd>
                        </div>
                      </dl>
                    </article>
                  </li>
                ))
              )}
            </ul>

            {lastPage > 1 ? (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-mute">
                  {t('pagination', { page, lastPage, total })}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || listLoading}
                    onClick={() => void loadOrganizations(page - 1)}
                  >
                    {t('prevPage')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= lastPage || listLoading}
                    onClick={() => void loadOrganizations(page + 1)}
                  >
                    {t('nextPage')}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
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
              {t('deleteConfirmTitle')}
            </h2>
            <p id={deleteDescId} className="mt-2 text-sm leading-6 text-body">
              {t('deleteConfirmBody', { name: deleteTarget.name })}
            </p>
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
                {t('deleteCancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deletePending}
                className="gap-2"
                onClick={() => void handleDeleteConfirm()}
              >
                {deletePending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('deleting')}
                  </>
                ) : (
                  t('deleteConfirm')
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editTarget && editForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!editPending) {
              setEditTarget(null)
              setEditForm(null)
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={editTitleId}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-dash-border bg-canvas p-5 shadow-[0_20px_50px_rgb(15_23_42/0.18)] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2">
              <Pencil className="mt-1 size-4 shrink-0 text-mute" aria-hidden />
              <div>
                <h2 id={editTitleId} className="font-display text-lg tracking-tight text-ink">
                  {t('editTitle')}
                </h2>
                <p className="mt-1 text-sm text-body">{t('editSubtitle', { name: editTarget.name })}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              {(
                [
                  ['name', 'editFields.name'],
                  ['phone', 'editFields.phone'],
                  ['website', 'editFields.website'],
                  ['industry', 'editFields.industry'],
                  ['timezone', 'editFields.timezone'],
                  ['currency', 'editFields.currency'],
                ] as const
              ).map(([key, labelKey]) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label htmlFor={`edit-org-${key}`} className="text-sm font-medium text-ink">
                    {t(labelKey)}
                  </label>
                  <Input
                    id={`edit-org-${key}`}
                    value={editForm[key]}
                    onChange={(e) =>
                      setEditForm((prev) => (prev ? { ...prev, [key]: e.target.value } : prev))
                    }
                    className="h-10 rounded-xl border-dash-border"
                    disabled={editPending}
                  />
                </div>
              ))}
            </div>

            {editError ? (
              <p role="alert" className="mt-3 text-sm text-negative">
                {editError}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={editPending}
                onClick={() => {
                  setEditTarget(null)
                  setEditForm(null)
                }}
              >
                {t('editCancel')}
              </Button>
              <Button
                type="button"
                disabled={editPending}
                className="gap-2"
                onClick={() => void handleEditSave()}
              >
                {editPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('saving')}
                  </>
                ) : (
                  t('editSave')
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
