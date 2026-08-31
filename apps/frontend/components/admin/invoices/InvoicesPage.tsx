'use client'

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Filter,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { KPIStatCard } from '@/components/dashboard/overview/KPIStatCard'
import { InvoiceListOverflowMenu } from './InvoiceListOverflowMenu'
import { InvoiceStatusBadge } from './InvoiceStatusBadge'
import {
  downloadInvoice,
  getInvoiceSummary,
  listInvoices,
  markInvoicePaid,
  regenerateInvoice,
  sendInvoice,
} from './invoice-service'
import {
  billingPeriodLabel,
  formatInvoiceDate,
  formatMoney,
  formatPeriodRange,
  getInitials,
  issueMonthOptions,
} from './invoice-utils'
import type { Invoice, InvoiceBillingPeriod, InvoiceStatus, ListInvoicesParams } from './types'
import { BILLING_PERIODS, INVOICE_STATUSES } from './types'

const PER_PAGE = 10

const selectClassName = cn(
  'h-11 w-full min-w-0 cursor-pointer rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

type StatusFilter = InvoiceStatus | 'all'
type BillingFilter = InvoiceBillingPeriod | 'all'

export function InvoicesPage() {
  const t = useTranslations('admin.invoices')
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchId = useId()

  const [page, setPage] = useState(1)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [issueMonth, setIssueMonth] = useState<string>('all')
  const [billingFilter, setBillingFilter] = useState<BillingFilter>('all')
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [rowPendingId, setRowPendingId] = useState<string | null>(null)

  const monthOptions = useMemo(() => issueMonthOptions(), [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const filterParams = useMemo<Omit<ListInvoicesParams, 'page' | 'perPage'>>(
    () => ({
      search: debouncedSearch,
      status: statusFilter,
      issueMonth,
      billingPeriod: billingFilter,
    }),
    [debouncedSearch, statusFilter, issueMonth, billingFilter]
  )

  const listKey = queryKeys.admin.invoices({ ...filterParams, page, perPage: PER_PAGE })
  const summaryKey = queryKeys.admin.invoiceSummary(filterParams)

  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: async () => listInvoices({ ...filterParams, page, perPage: PER_PAGE }),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  })

  const summaryQuery = useQuery({
    queryKey: summaryKey,
    queryFn: async () => getInvoiceSummary(filterParams),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  })

  const items = useMemo(() => listQuery.data?.items ?? [], [listQuery.data])
  const summary = summaryQuery.data ?? null
  const lastPage = listQuery.data?.lastPage ?? 1
  const total = listQuery.data?.total ?? 0
  const listLoading = listQuery.isLoading || summaryQuery.isLoading
  const listError = listQuery.error || summaryQuery.error ? t('errors.loadFailed') : null

  async function refreshInvoices() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.admin.invoicesRoot })])
  }

  const closeMenu = useCallback(() => {
    setMenuId(null)
    setMenuAnchor(null)
  }, [])

  const hasActiveFilters =
    Boolean(debouncedSearch.trim()) ||
    statusFilter !== 'all' ||
    issueMonth !== 'all' ||
    billingFilter !== 'all'

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setStatusFilter('all')
    setIssueMonth('all')
    setBillingFilter('all')
    setPage(1)
  }

  function showMessage(message: string) {
    setActionMessage(message)
    setActionError(null)
  }

  async function handleDownload(invoice: Invoice) {
    setRowPendingId(invoice.id)
    closeMenu()
    try {
      const result = await downloadInvoice(invoice.id, invoice.invoiceNumber)
      if (result.ok) showMessage(t(result.messageKey ?? 'toast.downloaded'))
      else {
        setActionError(null)
        showMessage(t(result.messageKey))
      }
    } catch {
      setActionError(t('errors.downloadFailed'))
      setActionMessage(null)
    } finally {
      setRowPendingId(null)
    }
  }

  async function handleSend(invoice: Invoice) {
    setRowPendingId(invoice.id)
    closeMenu()
    try {
      const result = await sendInvoice(invoice.id)
      if (result.ok) showMessage(t(result.messageKey ?? 'toast.sent'))
      else {
        setActionError(null)
        showMessage(t(result.messageKey))
      }
    } catch {
      setActionError(t('errors.sendFailed'))
      setActionMessage(null)
    } finally {
      setRowPendingId(null)
    }
  }

  async function handleMarkPaid(invoice: Invoice) {
    setRowPendingId(invoice.id)
    closeMenu()
    try {
      const result = await markInvoicePaid(invoice.id)
      if (!result.ok) {
        setActionError(t(result.messageKey))
        setActionMessage(null)
        return
      }
      showMessage(t(result.messageKey ?? 'toast.markedPaid'))
      await refreshInvoices()
    } finally {
      setRowPendingId(null)
    }
  }

  async function handleRegenerate(invoice: Invoice) {
    setRowPendingId(invoice.id)
    closeMenu()
    try {
      const result = await regenerateInvoice(invoice.id)
      if (!result.ok) {
        setActionError(t(result.messageKey))
        setActionMessage(null)
        return
      }
      showMessage(t(result.messageKey ?? 'toast.regenerated'))
      setPage(1)
      await refreshInvoices()
      if (result.invoice?.id) router.push(`/admin/invoices/${result.invoice.id}`)
    } finally {
      setRowPendingId(null)
    }
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)
  const menuInvoice = menuId ? (items.find((item) => item.id === menuId) ?? null) : null

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-body">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => showMessage(t('exportSoon'))}
          >
            <Download className="size-4" aria-hidden />
            {t('export')}
          </Button>
          <Button
            type="button"
            className="gap-2"
            onClick={() => router.push('/admin/invoices/generate')}
          >
            <Plus className="size-4" aria-hidden />
            {t('generate')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KPIStatCard
          label={t('kpis.total')}
          value={summary?.totalCount ?? 0}
          format="number"
          icon={FileText}
          hint={t('kpis.allTime')}
          loading={listLoading && !summary}
        />
        <KPIStatCard
          label={t('kpis.paid')}
          value={summary?.paidCount ?? 0}
          format="number"
          icon={CheckCircle2}
          hint={formatMoney(summary?.paidAmount ?? 0)}
          loading={listLoading && !summary}
        />
        <KPIStatCard
          label={t('kpis.pending')}
          value={summary?.pendingCount ?? 0}
          format="number"
          icon={Clock3}
          hint={formatMoney(summary?.pendingAmount ?? 0)}
          loading={listLoading && !summary}
        />
        <KPIStatCard
          label={t('kpis.overdue')}
          value={summary?.overdueCount ?? 0}
          format="number"
          icon={AlertTriangle}
          hint={formatMoney(summary?.overdueAmount ?? 0)}
          loading={listLoading && !summary}
        />
        <KPIStatCard
          label={t('kpis.cancelled')}
          value={summary?.cancelledCount ?? 0}
          format="number"
          icon={XCircle}
          hint={formatMoney(summary?.cancelledAmount ?? 0)}
          loading={listLoading && !summary}
        />
      </div>

      <DashboardPanel as="section" className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-lg tracking-tight text-ink">{t('tableTitle')}</h2>
            <p className="text-sm text-mute">{t('tableDescription', { count: total })}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <div className="relative min-w-0 flex-1 lg:w-72">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
                aria-hidden
              />
              <Input
                id={searchId}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="h-11 rounded-xl border-dash-border bg-canvas pl-9 text-sm"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Filter className="size-4" aria-hidden />
              {t('filters')}
            </Button>
          </div>
        </div>

        {filtersOpen ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter)
                setPage(1)
              }}
              className={selectClassName}
              aria-label={t('filterStatus')}
            >
              <option value="all">{t('filterAllStatuses')}</option>
              {INVOICE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`statuses.${status}`)}
                </option>
              ))}
            </select>
            <select
              value={issueMonth}
              onChange={(e) => {
                setIssueMonth(e.target.value)
                setPage(1)
              }}
              className={selectClassName}
              aria-label={t('filterDate')}
            >
              <option value="all">{t('filterAllDates')}</option>
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={billingFilter}
              onChange={(e) => {
                setBillingFilter(e.target.value as BillingFilter)
                setPage(1)
              }}
              className={selectClassName}
              aria-label={t('filterBilling')}
            >
              <option value="all">{t('filterAllBilling')}</option>
              {BILLING_PERIODS.map((period) => (
                <option key={period} value={period}>
                  {t(`billing.${period}`)}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={!hasActiveFilters}
              onClick={clearFilters}
            >
              {t('clearFilters')}
            </Button>
          </div>
        ) : null}

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
              onClick={() => void refreshInvoices()}
            >
              {t('retry')}
            </Button>
          </div>
        ) : null}

        {listLoading && items.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 py-16 text-mute">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-sm">{t('loading')}</p>
          </div>
        ) : (
          <>
            <div className="mt-4 hidden overflow-x-auto md:block">
              <div className="min-w-[980px] overflow-hidden rounded-2xl border border-dash-border">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-dash-surface/80">
                    <tr className="border-b border-dash-border text-xs tracking-wide text-mute uppercase">
                      <th className="px-4 py-3 font-semibold">{t('columns.invoiceNumber')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.organization')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.plan')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.amount')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.period')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.issueDate')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.dueDate')}</th>
                      <th className="px-4 py-3 font-semibold">{t('columns.status')}</th>
                      <th className="px-4 py-3 text-right font-semibold">{t('columns.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-sm text-mute">
                          {hasActiveFilters ? t('noMatches') : t('empty')}
                        </td>
                      </tr>
                    ) : (
                      items.map((invoice) => (
                        <tr
                          key={invoice.id}
                          className="border-b border-dash-border/80 last:border-b-0 hover:bg-dash-surface/40"
                        >
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className="cursor-pointer font-medium text-positive-deep hover:underline"
                              onClick={() => router.push(`/admin/invoices/${invoice.id}`)}
                            >
                              {invoice.invoiceNumber}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-pale text-xs font-semibold text-positive-deep">
                                {getInitials(invoice.organization.name) || 'OR'}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-ink">
                                  {invoice.organization.name}
                                </p>
                                <p className="truncate text-xs text-mute">
                                  {invoice.organization.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-ink">{invoice.planName}</p>
                            <p className="text-xs text-mute">
                              {billingPeriodLabel(invoice.billingPeriod, {
                                monthly: t('billing.monthly'),
                                yearly: t('billing.yearly'),
                                custom: t('billing.custom'),
                              })}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold tabular-nums text-ink">
                            {formatMoney(invoice.total, invoice.currency)}
                          </td>
                          <td className="px-4 py-3 text-sm tabular-nums text-body">
                            {formatPeriodRange(invoice.periodStart, invoice.periodEnd)}
                          </td>
                          <td className="px-4 py-3 text-sm tabular-nums text-body">
                            {formatInvoiceDate(invoice.issueDate)}
                          </td>
                          <td
                            className={cn(
                              'px-4 py-3 text-sm tabular-nums',
                              invoice.status === 'overdue'
                                ? 'font-medium text-negative'
                                : 'text-body'
                            )}
                          >
                            {formatInvoiceDate(invoice.dueDate)}
                          </td>
                          <td className="px-4 py-3">
                            <InvoiceStatusBadge
                              status={invoice.status}
                              label={t(`statuses.${invoice.status}`)}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-mute hover:bg-dash-surface hover:text-ink"
                                aria-label={t('actions.view')}
                                onClick={() => router.push(`/admin/invoices/${invoice.id}`)}
                              >
                                <Eye className="size-4" />
                              </button>
                              <button
                                type="button"
                                className="inline-flex size-8 items-center justify-center rounded-lg text-mute hover:bg-dash-surface hover:text-ink"
                                aria-label={t('actions.download')}
                                disabled={rowPendingId === invoice.id}
                                onClick={() => void handleDownload(invoice)}
                              >
                                {rowPendingId === invoice.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Download className="size-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                className="inline-flex size-8 items-center justify-center rounded-lg text-mute hover:bg-dash-surface hover:text-ink"
                                aria-label={t('actions.openMenu')}
                                aria-expanded={menuId === invoice.id}
                                aria-haspopup="menu"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (menuId === invoice.id) {
                                    closeMenu()
                                    return
                                  }
                                  setMenuId(invoice.id)
                                  setMenuAnchor(e.currentTarget)
                                }}
                              >
                                <MoreVertical className="size-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <ul className="mt-4 flex flex-col gap-3 md:hidden">
              {items.length === 0 ? (
                <li className="rounded-2xl border border-dash-border px-4 py-10 text-center text-sm text-mute">
                  {hasActiveFilters ? t('noMatches') : t('empty')}
                </li>
              ) : (
                items.map((invoice) => (
                  <li key={invoice.id}>
                    <button
                      type="button"
                      className="w-full cursor-pointer rounded-2xl border border-dash-border bg-dash-surface/60 p-4 text-left"
                      onClick={() => router.push(`/admin/invoices/${invoice.id}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-positive-deep">
                            {invoice.invoiceNumber}
                          </p>
                          <p className="mt-1 text-sm font-medium text-ink">
                            {invoice.organization.name}
                          </p>
                        </div>
                        <InvoiceStatusBadge
                          status={invoice.status}
                          label={t(`statuses.${invoice.status}`)}
                        />
                      </div>
                      <p className="mt-3 text-sm text-body">
                        {invoice.planName} · {formatMoney(invoice.total, invoice.currency)}
                      </p>
                      <p className="mt-1 text-xs text-mute">
                        {t('columns.dueDate')}: {formatInvoiceDate(invoice.dueDate)}
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-mute">
                {t('showingRange', { start: rangeStart, end: rangeEnd, total })}
              </p>
              {lastPage > 1 ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || listLoading}
                    onClick={() => setPage(page - 1)}
                  >
                    {t('prevPage')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= lastPage || listLoading}
                    onClick={() => setPage(page + 1)}
                  >
                    {t('nextPage')}
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </DashboardPanel>
      <InvoiceListOverflowMenu
        key={menuInvoice?.id ?? 'invoice-overflow-menu'}
        open={Boolean(menuInvoice && menuAnchor)}
        anchor={menuAnchor}
        onClose={closeMenu}
      >
        {menuInvoice ? (
          <>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
              onClick={() => {
                closeMenu()
                router.push(`/admin/invoices/${menuInvoice.id}`)
              }}
            >
              <Eye className="size-3.5" />
              {t('actions.view')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
              onClick={() => void handleDownload(menuInvoice)}
            >
              <Download className="size-3.5" />
              {t('actions.download')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
              onClick={() => void handleRegenerate(menuInvoice)}
            >
              <RefreshCw className="size-3.5" />
              {t('actions.regenerate')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
              onClick={() => void handleSend(menuInvoice)}
            >
              <Send className="size-3.5" />
              {t('actions.send')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface disabled:opacity-50"
              disabled={menuInvoice.status === 'paid' || menuInvoice.status === 'cancelled'}
              onClick={() => void handleMarkPaid(menuInvoice)}
            >
              <CheckCircle2 className="size-3.5" />
              {t('actions.markPaid')}
            </button>
          </>
        ) : null}
      </InvoiceListOverflowMenu>
    </div>
  )
}
