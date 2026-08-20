'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import {
  Eye,
  FileEdit,
  Filter,
  FolderOpen,
  Loader2,
  Megaphone,
  MoreVertical,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import { api, type CustomerGroup, type CustomerGroupStatus } from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { usePermissions } from '@/hooks/usePermissions'
import { PERMISSIONS } from '@/lib/rbac'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { KPIStatCard } from '@/components/dashboard/overview/KPIStatCard'
import { DashboardToast, useDashboardToast } from '@/components/dashboard/ui/use-dashboard-toast'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { CustomerGroupDeleteDialog } from './CustomerGroupDeleteDialog'
import { CustomerGroupFormDialog } from './CustomerGroupFormDialog'
import {
  CustomerGroupStatusBadge,
  CustomerGroupTypeBadge,
} from './CustomerGroupStatusBadge'
import {
  createCustomerGroup,
  deleteCustomerGroup,
  getCustomerGroupSummary,
  getCustomerGroupWithMembers,
  listCustomerGroups,
  updateCustomerGroup,
  type CustomerGroupWriteResult,
} from './customer-group-service'
import {
  CUSTOMER_GROUPS_PAGE_SIZE,
  customerGroupErrorMessage,
  formatGroupDate,
  groupAccentClass,
  groupInitials,
  unwrapContacts,
} from './customer-group-utils'

const selectClassName = cn(
  'h-11 w-full min-w-0 rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

type StatusFilter = CustomerGroupStatus | 'all'

export function CustomerGroupsPage() {
  const t = useTranslations('dashboard.customerGroups')
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast, showToast, clearToast } = useDashboardToast()
  const {
    tenantOrganizationId,
    canViewContacts,
    canCreateContacts,
    isLoading: orgsLoading,
  } = useOrganizations()
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission(PERMISSIONS.CONTACTS_EDIT)
  const canDelete = hasPermission(PERMISSIONS.CONTACTS_DELETE)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editingGroup, setEditingGroup] = useState<CustomerGroup | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CustomerGroup | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const filterKey = `${debouncedSearch}|${statusFilter}`
  const [appliedFilterKey, setAppliedFilterKey] = useState(filterKey)
  if (filterKey !== appliedFilterKey) {
    setAppliedFilterKey(filterKey)
    setPage(1)
  }

  useEffect(() => {
    function onDocClick() {
      setMenuId(null)
      setMenuAnchor(null)
    }
    if (menuId) {
      document.addEventListener('click', onDocClick)
      return () => document.removeEventListener('click', onDocClick)
    }
  }, [menuId])

  const listQuery = useQuery({
    queryKey: [...queryKeys.customerGroups.list(tenantOrganizationId), debouncedSearch, statusFilter],
    enabled: Boolean(tenantOrganizationId) && canViewContacts && !orgsLoading,
    queryFn: () =>
      listCustomerGroups(tenantOrganizationId, {
        search: debouncedSearch,
        status: statusFilter,
      }),
  })

  const summaryQuery = useQuery({
    queryKey: queryKeys.customerGroups.summary(tenantOrganizationId),
    enabled: Boolean(tenantOrganizationId) && canViewContacts && !orgsLoading,
    queryFn: () => getCustomerGroupSummary(tenantOrganizationId),
  })

  const contactsQuery = useQuery({
    queryKey: queryKeys.customerGroups.contacts(tenantOrganizationId),
    enabled: Boolean(tenantOrganizationId) && canViewContacts && !orgsLoading && formOpen,
    queryFn: async () => {
      const { data } = await api.contacts.list()
      return unwrapContacts(data)
    },
  })

  const groups = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const totalPages = Math.max(1, Math.ceil(groups.length / CUSTOMER_GROUPS_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * CUSTOMER_GROUPS_PAGE_SIZE
    return groups.slice(start, start + CUSTOMER_GROUPS_PAGE_SIZE)
  }, [groups, currentPage])

  const menuGroup = menuId ? groups.find((group) => group.id === menuId) ?? null : null

  const hasFilters = Boolean(debouncedSearch.trim()) || statusFilter !== 'all'
  const summary = summaryQuery.data
  const loading = listQuery.isLoading || orgsLoading

  function invalidateGroups() {
    return queryClient.invalidateQueries({ queryKey: queryKeys.customerGroups.all })
  }

  const saveMutation = useMutation({
    mutationFn: async (values: {
      name: string
      description: string
      status: CustomerGroupStatus
      contactIds: string[]
    }): Promise<CustomerGroupWriteResult> => {
      if (formMode === 'edit' && editingGroup) {
        return updateCustomerGroup(tenantOrganizationId, editingGroup.id, values)
      }
      return createCustomerGroup(tenantOrganizationId, values)
    },
    onSuccess: async (result) => {
      await invalidateGroups()
      if (result.failedAssignments > 0) {
        setFormMode('edit')
        setEditingGroup(result.group)
        setFormError(
          t('errors.membersPartialFailed', {
            failed: result.failedAssignments,
            total: result.attemptedAssignments,
          })
        )
        return
      }
      setFormOpen(false)
      setEditingGroup(null)
      setFormError(null)
      showToast(formMode === 'edit' ? t('toast.updated') : t('toast.created'), 'success')
    },
    onError: (err) => {
      setFormError(customerGroupErrorMessage(err, t, 'errors.saveFailed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (group: CustomerGroup) => {
      await deleteCustomerGroup(tenantOrganizationId, group.id)
    },
    onSuccess: async () => {
      setDeleteTarget(null)
      setDeleteError(null)
      showToast(t('toast.deleted'), 'success')
      await invalidateGroups()
    },
    onError: (err) => {
      setDeleteError(customerGroupErrorMessage(err, t, 'errors.deleteFailed'))
    },
  })

  async function openEdit(group: CustomerGroup) {
    setMenuId(null)
    setMenuAnchor(null)
    setFormMode('edit')
    setFormError(null)
    setEditLoadingId(group.id)
    try {
      const full = await getCustomerGroupWithMembers(tenantOrganizationId, group.id)
      setEditingGroup(full)
      setFormOpen(true)
    } catch (err) {
      showToast(customerGroupErrorMessage(err, t, 'errors.loadFailed'), 'error')
    } finally {
      setEditLoadingId(null)
    }
  }

  if (!orgsLoading && !canViewContacts) {
    return (
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
    )
  }

  const showEmpty = !loading && !listQuery.isError && groups.length === 0 && !hasFilters
  const showNoMatches = !loading && !listQuery.isError && groups.length === 0 && hasFilters
  const rangeStart = groups.length === 0 ? 0 : (currentPage - 1) * CUSTOMER_GROUPS_PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * CUSTOMER_GROUPS_PAGE_SIZE, groups.length)

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-body">{t('subtitle')}</p>
        </div>
        {canCreateContacts ? (
          <Button
            type="button"
            className="gap-2 self-start"
            onClick={() => {
              setFormMode('create')
              setEditingGroup(null)
              setFormError(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" aria-hidden />
            {t('create')}
          </Button>
        ) : null}
      </div>

      {toast ? (
        <DashboardToast
          message={toast.message}
          variant={toast.variant}
          onDismiss={clearToast}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPIStatCard
          label={t('kpis.totalGroups')}
          value={summary?.totalGroups ?? 0}
          format="number"
          icon={FolderOpen}
          hint={t('kpis.totalGroupsHint')}
          loading={summaryQuery.isLoading && !summary}
        />
        <KPIStatCard
          label={t('kpis.totalContacts')}
          value={summary?.totalContacts ?? 0}
          format="number"
          icon={Users}
          hint={t('kpis.totalContactsHint')}
          loading={summaryQuery.isLoading && !summary}
        />
        <KPIStatCard
          label={t('kpis.usedInCampaigns')}
          value={summary?.usedInCampaigns ?? '—'}
          format="plain"
          icon={Megaphone}
          hint={t('kpis.usedInCampaignsHint')}
          loading={summaryQuery.isLoading && !summary}
        />
        <KPIStatCard
          label={t('kpis.engagementRate')}
          value={summary?.engagementRate == null ? '—' : `${summary.engagementRate}%`}
          format="plain"
          icon={Sparkles}
          hint={t('kpis.engagementRateHint')}
          loading={summaryQuery.isLoading && !summary}
        />
      </div>

      <DashboardPanel as="section" className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="h-11 rounded-xl border-dash-border bg-canvas pl-9 text-sm"
              aria-label={t('searchPlaceholder')}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={cn(selectClassName, 'sm:w-44')}
            aria-label={t('filterStatus')}
          >
            <option value="all">{t('filterAllStatuses')}</option>
            <option value="active">{t('status.active')}</option>
            <option value="inactive">{t('status.inactive')}</option>
          </select>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            {t('filters')}
          </Button>
        </div>

        {filtersOpen ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dash-border bg-dash-surface/50 px-3 py-2">
            <p className="text-sm text-body">{t('filtersHint')}</p>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={!hasFilters}
              onClick={() => {
                setSearch('')
                setDebouncedSearch('')
                setStatusFilter('all')
              }}
            >
              {t('clearFilters')}
            </Button>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : listQuery.isError ? (
          <div
            role="alert"
            className="mt-8 flex flex-col gap-3 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative sm:flex-row sm:items-center sm:justify-between"
          >
            <p>
              {customerGroupErrorMessage(listQuery.error, t, 'errors.loadFailed')}
            </p>
            <Button type="button" variant="outline" size="xs" onClick={() => void listQuery.refetch()}>
              {t('retry')}
            </Button>
          </div>
        ) : showEmpty ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border bg-dash-surface/50 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
              <Filter className="size-5" aria-hidden />
            </span>
            <p className="font-medium text-ink">{t('emptyTitle')}</p>
            <p className="max-w-sm text-sm text-body">{t('emptyDescription')}</p>
            {canCreateContacts ? (
              <Button
                type="button"
                className="mt-2 gap-2"
                onClick={() => {
                  setFormMode('create')
                  setEditingGroup(null)
                  setFormError(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="size-4" aria-hidden />
                {t('create')}
              </Button>
            ) : null}
          </div>
        ) : showNoMatches ? (
          <p className="mt-8 py-10 text-center text-sm text-body">{t('noMatches')}</p>
        ) : (
          <>
            <div className="mt-5 overflow-x-auto">
              <div className="hidden min-w-[720px] md:block">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-dash-border text-xs font-semibold tracking-wide text-mute uppercase">
                      <th className="px-4 py-3 font-semibold">{t('columns.name')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.contacts')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.type')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.usedIn')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.createdOn')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.status')}</th>
                      <th className="px-4 py-3 text-right font-semibold">{t('columns.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((group) => (
                      <tr key={group.id} className="border-b border-dash-border last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={cn(
                                'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                groupAccentClass(group.name)
                              )}
                            >
                              {groupInitials(group.name)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-ink">{group.name}</p>
                              {group.description ? (
                                <p className="truncate text-sm text-body">{group.description}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm tabular-nums text-body">
                          {group.contactCount}
                        </td>
                        <td className="px-4 py-3">
                          <CustomerGroupTypeBadge label={t('type.static')} />
                        </td>
                        <td className="px-4 py-3 text-sm text-body">
                          {group.usedInCampaigns == null
                            ? '—'
                            : t('usedInCampaigns', { count: group.usedInCampaigns })}
                        </td>
                        <td className="px-4 py-3 text-sm text-body">
                          {formatGroupDate(group.createdAt, locale)}
                        </td>
                        <td className="px-4 py-3">
                          <CustomerGroupStatusBadge
                            status={group.status}
                            label={t(`status.${group.status}`)}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-lg text-mute hover:bg-dash-surface hover:text-ink"
                            aria-label={t('actions.openMenu')}
                            aria-expanded={menuId === group.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (menuId === group.id) {
                                setMenuId(null)
                                setMenuAnchor(null)
                                return
                              }
                              setMenuAnchor(e.currentTarget)
                              setMenuId(group.id)
                            }}
                          >
                            <MoreVertical className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <ul className="mt-4 flex flex-col gap-3 md:hidden">
              {pageItems.map((group) => (
                <li key={group.id}>
                  <Link
                    href={`/dashboard/customer-groups/${group.id}`}
                    className="block rounded-2xl border border-dash-border bg-dash-surface/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                            groupAccentClass(group.name)
                          )}
                        >
                          {groupInitials(group.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">{group.name}</p>
                          {group.description ? (
                            <p className="mt-1 text-sm text-body">{group.description}</p>
                          ) : null}
                          <p className="mt-2 text-xs text-mute">
                            {t('mobileMeta', {
                              count: group.contactCount,
                              date: formatGroupDate(group.createdAt, locale),
                            })}
                          </p>
                        </div>
                      </div>
                      <CustomerGroupStatusBadge
                        status={group.status}
                        label={t(`status.${group.status}`)}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-body">
                {t('pagination', { from: rangeStart, to: rangeEnd, total: groups.length })}
              </p>
              {totalPages > 1 ? (
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    {t('prev')}
                  </Button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                    <Button
                      key={pageNumber}
                      type="button"
                      variant={pageNumber === currentPage ? 'default' : 'ghost'}
                      size="xs"
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  >
                    {t('next')}
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </DashboardPanel>

      <DashboardPanel as="section" className="border-primary/20 bg-primary-pale/40 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base text-ink">{t('about.title')}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-body">{t('about.body')}</p>
          </div>
          <p className="shrink-0 text-sm font-medium text-positive-deep">{t('about.link')}</p>
        </div>
      </DashboardPanel>

      <CustomerGroupRowMenu
        open={Boolean(menuId && menuGroup && menuAnchor)}
        anchor={menuAnchor}
        canEdit={canEdit}
        canDelete={canDelete}
        editPending={menuGroup ? editLoadingId === menuGroup.id : false}
        viewLabel={t('actions.view')}
        editLabel={t('actions.edit')}
        deleteLabel={t('actions.delete')}
        onView={() => {
          if (!menuGroup) return
          setMenuId(null)
          setMenuAnchor(null)
          router.push(`/dashboard/customer-groups/${menuGroup.id}`)
        }}
        onEdit={() => {
          if (!menuGroup) return
          void openEdit(menuGroup)
        }}
        onDelete={() => {
          if (!menuGroup) return
          setMenuId(null)
          setMenuAnchor(null)
          setDeleteError(null)
          setDeleteTarget(menuGroup)
        }}
      />

      <CustomerGroupFormDialog
        open={formOpen}
        mode={formMode}
        group={editingGroup}
        contacts={contactsQuery.data ?? []}
        contactsLoading={contactsQuery.isLoading}
        contactsError={
          contactsQuery.isError
            ? customerGroupErrorMessage(contactsQuery.error, t, 'picker.loadFailed')
            : null
        }
        onRetryContacts={() => {
          void contactsQuery.refetch()
        }}
        pending={saveMutation.isPending}
        error={formError}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) {
            setEditingGroup(null)
            setFormError(null)
          }
        }}
        onSubmit={(values) => saveMutation.mutate(values)}
      />

      <CustomerGroupDeleteDialog
        open={Boolean(deleteTarget)}
        group={deleteTarget}
        pending={deleteMutation.isPending}
        error={deleteError}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget)
        }}
      />
    </div>
  )
}

const ROW_MENU_WIDTH = 176
const ROW_MENU_PAD = 8
const ROW_MENU_GAP = 4

type CustomerGroupRowMenuProps = {
  open: boolean
  anchor: HTMLElement | null
  canEdit: boolean
  canDelete: boolean
  editPending: boolean
  viewLabel: string
  editLabel: string
  deleteLabel: string
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}

function CustomerGroupRowMenu({
  open,
  anchor,
  canEdit,
  canDelete,
  editPending,
  viewLabel,
  editLabel,
  deleteLabel,
  onView,
  onEdit,
  onDelete,
}: CustomerGroupRowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor) return
    const menuAnchor = anchor

    function update() {
      if (!menuRef.current) return
      const rect = menuAnchor.getBoundingClientRect()
      const height = menuRef.current.offsetHeight || 140
      const spaceBelow = window.innerHeight - rect.bottom - ROW_MENU_PAD
      const openAbove = spaceBelow < height && rect.top - ROW_MENU_PAD > spaceBelow
      let top = openAbove ? rect.top - ROW_MENU_GAP - height : rect.bottom + ROW_MENU_GAP
      let left = rect.right - ROW_MENU_WIDTH
      top = Math.min(
        Math.max(ROW_MENU_PAD, top),
        Math.max(ROW_MENU_PAD, window.innerHeight - height - ROW_MENU_PAD)
      )
      left = Math.min(
        Math.max(ROW_MENU_PAD, left),
        Math.max(ROW_MENU_PAD, window.innerWidth - ROW_MENU_WIDTH - ROW_MENU_PAD)
      )
      setCoords({ top, left })
    }

    const frame = window.requestAnimationFrame(update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchor])

  if (!open || !anchor || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className={cn(
        'fixed z-80 w-44 overflow-hidden rounded-xl border border-dash-border bg-canvas py-1 shadow-lg',
        !coords && 'invisible'
      )}
      style={coords ? { top: coords.top, left: coords.left } : { top: 0, left: 0 }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
        onClick={onView}
      >
        <Eye className="size-3.5" />
        {viewLabel}
      </button>
      {canEdit ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
          disabled={editPending}
          onClick={onEdit}
        >
          <FileEdit className="size-3.5" />
          {editLabel}
        </button>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-negative hover:bg-negative/5"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
          {deleteLabel}
        </button>
      ) : null}
    </div>,
    document.body
  )
}
