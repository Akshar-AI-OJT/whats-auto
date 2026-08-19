'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2, RefreshCw, ScrollText, Search } from 'lucide-react'
import { api, type ApiError, type AuthorizationAuditEvent } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { listSuperAdminOrganizations } from '@/components/admin/organizations/organization-api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const LIMIT_OPTIONS = [25, 50, 100] as const

type AuditStatus = 'granted' | 'revoked' | 'recorded'

function unwrapAuditEvents(data: unknown): AuthorizationAuditEvent[] {
  if (!data) return []
  if (Array.isArray(data)) return data as AuthorizationAuditEvent[]
  if (typeof data === 'object' && data !== null && 'data' in data) {
    const wrapped = data as { data?: AuthorizationAuditEvent[] }
    if (Array.isArray(wrapped.data)) return wrapped.data
  }
  return []
}

function formatTimestamp(value: string | Date | null | undefined) {
  if (!value) return '—'
  try {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date)
  } catch {
    return String(value)
  }
}

function formatJson(value: unknown) {
  if (value == null) return null
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function eventTime(value: string | Date | null | undefined): number | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()
  return Number.isNaN(time) ? null : time
}

function actorLabel(event: AuthorizationAuditEvent, empty: string) {
  return event.actorName || event.actorEmail || event.actorUserId || empty
}

function organizationLabel(event: AuthorizationAuditEvent, empty: string) {
  return event.organizationName || event.organizationId || empty
}

function auditStatus(granted: boolean | null | undefined): AuditStatus {
  if (granted === true) return 'granted'
  if (granted === false) return 'revoked'
  return 'recorded'
}

const STATUS_CLASS: Record<AuditStatus, string> = {
  granted: 'bg-primary-pale text-positive-deep ring-1 ring-primary/30',
  revoked: 'bg-negative/10 text-negative ring-1 ring-negative/25',
  recorded: 'bg-dash-surface text-body ring-1 ring-dash-border',
}

const selectClassName = cn(
  'h-10 w-full rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

export function PlatformAuditLogsPage() {
  const t = useTranslations('admin.auditLogs')
  const [limit, setLimit] = useState<(typeof LIMIT_OPTIONS)[number]>(50)
  const [organizationId, setOrganizationId] = useState('')
  const [search, setSearch] = useState('')
  const [eventFilter, setEventFilter] = useState('all')
  const [actorFilter, setActorFilter] = useState('all')
  const [entityFilter, setEntityFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<AuthorizationAuditEvent | null>(null)

  const orgsQuery = useQuery({
    queryKey: ['admin-audit-log-organizations'],
    queryFn: async () => {
      const { items } = await listSuperAdminOrganizations({ page: 1, perPage: 100 })
      return items
    },
  })

  const auditQuery = useQuery({
    queryKey: ['admin-audit-logs', limit, organizationId],
    queryFn: async () => {
      const { data } = await api.superAdmin.auditLogs.list({
        limit,
        organizationId: organizationId || undefined,
      })
      return unwrapAuditEvents(data)
    },
  })

  const events = useMemo(() => auditQuery.data ?? [], [auditQuery.data])

  const eventOptions = useMemo(
    () => [...new Set(events.map((event) => event.eventType).filter(Boolean))].sort(),
    [events]
  )

  const actorOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const event of events) {
      const key = event.actorUserId || actorLabel(event, t('emptyValue'))
      if (!map.has(key)) map.set(key, actorLabel(event, t('emptyValue')))
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [events, t])

  const entityOptions = useMemo(
    () => [...new Set(events.map((event) => event.targetType).filter(Boolean))].sort(),
    [events]
  )

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase()
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null

    return events.filter((event) => {
      if (eventFilter !== 'all' && event.eventType !== eventFilter) return false
      if (actorFilter !== 'all') {
        const key = event.actorUserId || actorLabel(event, t('emptyValue'))
        if (key !== actorFilter) return false
      }
      if (entityFilter !== 'all' && event.targetType !== entityFilter) return false

      const time = eventTime(event.createdAt)
      if (fromTime != null && (time == null || time < fromTime)) return false
      if (toTime != null && (time == null || time > toTime)) return false

      if (!query) return true
      const haystack = [
        event.eventType,
        event.reason,
        event.targetType,
        event.targetId,
        event.actorUserId,
        event.actorName,
        event.actorEmail,
        event.organizationId,
        event.organizationName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [actorFilter, dateFrom, dateTo, entityFilter, eventFilter, events, search, t])

  const selectedBefore = useMemo(() => (selected ? formatJson(selected.before) : null), [selected])
  const selectedAfter = useMemo(() => (selected ? formatJson(selected.after) : null), [selected])
  const selectedStatus = selected ? auditStatus(selected.granted) : null

  return (
    <div className="mx-auto flex w-full max-w-300 flex-col gap-5 sm:gap-6">
      <DashboardPanel
        as="section"
        className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-primary-pale/80 blur-[70px]"
        />
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
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-body">
              <span className="whitespace-nowrap">{t('limitLabel')}</span>
              <select
                className={cn(selectClassName, 'w-auto')}
                value={limit}
                aria-label={t('limitLabel')}
                onChange={(e) => setLimit(Number(e.target.value) as (typeof LIMIT_OPTIONS)[number])}
              >
                {LIMIT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={auditQuery.isFetching}
              onClick={() => auditQuery.refetch()}
            >
              <RefreshCw
                className={cn('size-4', auditQuery.isFetching && 'animate-spin')}
                aria-hidden
              />
              {t('refresh')}
            </Button>
          </div>
        </div>
      </DashboardPanel>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader
          title={t('tableTitle')}
          description={
            auditQuery.isSuccess
              ? t('tableDescription', { count: filteredEvents.length })
              : t('tableDescriptionLoading')
          }
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="relative min-w-0 sm:col-span-2 xl:col-span-1">
            <label htmlFor="audit-search" className="sr-only">
              {t('filters.search')}
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              id="audit-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('searchPlaceholder')}
              className="h-10 rounded-xl border-dash-border bg-canvas pl-10 text-sm shadow-none"
            />
          </div>

          <select
            className={selectClassName}
            value={eventFilter}
            aria-label={t('filters.event')}
            onChange={(event) => setEventFilter(event.target.value)}
          >
            <option value="all">{t('filters.allEvents')}</option>
            {eventOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            className={selectClassName}
            value={actorFilter}
            aria-label={t('filters.actor')}
            onChange={(event) => setActorFilter(event.target.value)}
          >
            <option value="all">{t('filters.allActors')}</option>
            {actorOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            className={selectClassName}
            value={organizationId}
            aria-label={t('filters.organization')}
            onChange={(event) => setOrganizationId(event.target.value)}
          >
            <option value="">{t('filters.allOrganizations')}</option>
            {(orgsQuery.data ?? []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>

          <select
            className={selectClassName}
            value={entityFilter}
            aria-label={t('filters.entityType')}
            onChange={(event) => setEntityFilter(event.target.value)}
          >
            <option value="all">{t('filters.allEntityTypes')}</option>
            {entityOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3 sm:col-span-2 xl:col-span-1">
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              aria-label={t('filters.dateFrom')}
              className="h-10 rounded-xl border-dash-border bg-canvas px-3 text-sm shadow-none"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              aria-label={t('filters.dateTo')}
              className="h-10 rounded-xl border-dash-border bg-canvas px-3 text-sm shadow-none"
            />
          </div>
        </div>

        {auditQuery.isLoading ? (
          <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : auditQuery.isError ? (
          <div
            role="alert"
            className="mt-8 space-y-2 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
          >
            <p>{(auditQuery.error as unknown as ApiError)?.message || t('errors.loadFailed')}</p>
            <p className="text-body">{t('errors.loadFailedHint')}</p>
          </div>
        ) : events.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border bg-dash-surface/50 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
              <ScrollText className="size-5" aria-hidden />
            </span>
            <p className="font-medium text-ink">{t('emptyTitle')}</p>
            <p className="max-w-md text-sm text-body">{t('emptyDescription')}</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border bg-dash-surface/50 px-6 py-16 text-center">
            <p className="font-medium text-ink">{t('emptyFilteredTitle')}</p>
            <p className="max-w-md text-sm text-body">{t('emptyFilteredDescription')}</p>
          </div>
        ) : (
          <>
            <div className="mt-5 hidden overflow-hidden rounded-2xl border border-dash-border md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-270 border-collapse text-left">
                  <thead>
                    <tr className="border-b border-dash-border bg-dash-surface">
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink sm:px-5">
                        {t('columns.event')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.actor')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.target')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.organization')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.timestamp')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.status')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink sm:px-5">
                        <span className="sr-only">{t('columns.actions')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((event, index) => {
                      const status = auditStatus(event.granted)
                      return (
                        <tr
                          key={event.id}
                          className={cn(
                            'border-b border-dash-border last:border-b-0',
                            'transition-colors duration-150',
                            index % 2 === 1 && 'bg-dash-surface/60'
                          )}
                        >
                          <td className="px-4 py-3.5 text-sm font-medium text-ink sm:px-5">
                            {event.eventType}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-body">
                            {actorLabel(event, t('emptyValue'))}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-body">
                            <span className="font-medium text-ink">{event.targetType}</span>
                            {event.targetId ? (
                              <span className="mt-0.5 block font-mono text-xs text-mute">
                                {event.targetId}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-body">
                            {organizationLabel(event, t('emptyValue'))}
                          </td>
                          <td className="px-4 py-3.5 text-sm tabular-nums text-body">
                            {formatTimestamp(event.createdAt)}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                                STATUS_CLASS[status]
                              )}
                            >
                              {t(`status.${status}`)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 sm:px-5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setSelected(event)}
                            >
                              {t('viewDetails')}
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <ul className="mt-5 flex flex-col gap-3 md:hidden">
              {filteredEvents.map((event) => {
                const status = auditStatus(event.granted)
                return (
                  <li
                    key={event.id}
                    className="rounded-2xl border border-dash-border bg-dash-surface/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{event.eventType}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelected(event)}
                      >
                        {t('viewDetails')}
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-mute">{formatTimestamp(event.createdAt)}</p>
                    <div className="mt-3 space-y-1 text-xs text-mute">
                      <p>
                        {t('columns.actor')}: {actorLabel(event, t('emptyValue'))}
                      </p>
                      <p>
                        {t('columns.target')}: {event.targetType}
                        {event.targetId ? ` · ${event.targetId}` : ''}
                      </p>
                      <p>
                        {t('columns.organization')}: {organizationLabel(event, t('emptyValue'))}
                      </p>
                      <p>
                        {t('columns.status')}: {t(`status.${status}`)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </DashboardPanel>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <DialogContent
          className="h-[min(88vh,800px)] max-h-[88vh] w-[min(94vw,880px)] max-w-220 gap-0 overflow-hidden p-0"
          showCloseButton
        >
          <DialogHeader className="shrink-0 border-b border-dash-border px-6 py-5 text-left sm:px-8">
            <DialogTitle>{t('details.title')}</DialogTitle>
            <DialogDescription>
              {selected?.eventType || t('details.fallbackEvent')}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5 sm:px-8">
              <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3">
                  <dt className="text-mute">{t('columns.timestamp')}</dt>
                  <dd className="text-right text-ink">{formatTimestamp(selected.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-mute">{t('columns.actor')}</dt>
                  <dd className="max-w-[70%] break-all text-right text-ink">
                    {actorLabel(selected, t('emptyValue'))}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-mute">{t('columns.organization')}</dt>
                  <dd className="max-w-[70%] break-all text-right text-ink">
                    {organizationLabel(selected, t('emptyValue'))}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-mute">{t('columns.event')}</dt>
                  <dd className="text-right text-ink">{selected.eventType}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-mute">{t('columns.status')}</dt>
                  <dd className="text-right text-ink">
                    {selectedStatus ? t(`status.${selectedStatus}`) : t('emptyValue')}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-mute">{t('details.targetType')}</dt>
                  <dd className="text-right text-ink">{selected.targetType}</dd>
                </div>
                <div className="flex justify-between gap-3 sm:col-span-2">
                  <dt className="text-mute">{t('details.targetId')}</dt>
                  <dd className="max-w-[80%] break-all text-right font-mono text-xs text-ink">
                    {selected.targetId || t('emptyValue')}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 sm:col-span-2">
                  <dt className="text-mute">{t('columns.reason')}</dt>
                  <dd className="max-w-[80%] text-right text-ink">
                    {selected.reason || t('emptyValue')}
                  </dd>
                </div>
              </dl>

              {selectedBefore ? (
                <div>
                  <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('details.before')}
                  </p>
                  <pre className="mt-2 min-h-48 overflow-auto rounded-xl border border-dash-border bg-dash-surface/50 p-4 font-mono text-sm leading-6 text-ink">
                    {selectedBefore}
                  </pre>
                </div>
              ) : null}

              {selectedAfter ? (
                <div>
                  <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('details.after')}
                  </p>
                  <pre className="mt-2 min-h-48 overflow-auto rounded-xl border border-dash-border bg-dash-surface/50 p-4 font-mono text-sm leading-6 text-ink">
                    {selectedAfter}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="shrink-0 border-t border-dash-border px-6 py-4 sm:px-8">
            <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
              <Button type="button" onClick={() => setSelected(null)}>
                {t('details.close')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
