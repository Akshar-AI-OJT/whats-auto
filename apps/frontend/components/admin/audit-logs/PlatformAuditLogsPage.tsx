'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2, RefreshCw, ScrollText } from 'lucide-react'
import { api, type ApiError, type AuthorizationAuditEvent } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const LIMIT_OPTIONS = [25, 50, 100] as const

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

function isNoActiveOrganizationError(error: unknown): boolean {
  const apiError = error as ApiError | undefined
  if (!apiError) return false
  const message = apiError.message?.toLowerCase() ?? ''
  return (
    apiError.code === 'E_NO_ACTIVE_ORGANIZATION' ||
    message.includes('no active organization') ||
    message.includes('set-active')
  )
}

const selectClassName = cn(
  'h-10 rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

export function PlatformAuditLogsPage() {
  const t = useTranslations('admin.auditLogs')
  const [limit, setLimit] = useState<(typeof LIMIT_OPTIONS)[number]>(50)
  const [selected, setSelected] = useState<AuthorizationAuditEvent | null>(null)

  const auditQuery = useQuery({
    queryKey: ['admin-audit-logs', limit],
    queryFn: async () => {
      const { data } = await api.audit.list({ limit })
      return unwrapAuditEvents(data)
    },
  })

  const events = auditQuery.data ?? []

  const selectedBefore = useMemo(
    () => (selected ? formatJson(selected.before) : null),
    [selected]
  )
  const selectedAfter = useMemo(
    () => (selected ? formatJson(selected.after) : null),
    [selected]
  )

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
                className={selectClassName}
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
              ? t('tableDescription', { count: events.length })
              : t('tableDescriptionLoading')
          }
        />

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
            <p>
              {(auditQuery.error as unknown as ApiError)?.message || t('errors.loadFailed')}
            </p>
            <p className="text-body">
              {isNoActiveOrganizationError(auditQuery.error)
                ? t('errors.noActiveOrgMissingFlow')
                : t('errors.loadFailedHint')}
            </p>
          </div>
        ) : events.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border bg-dash-surface/50 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
              <ScrollText className="size-5" aria-hidden />
            </span>
            <p className="font-medium text-ink">{t('emptyTitle')}</p>
            <p className="max-w-md text-sm text-body">{t('emptyDescription')}</p>
          </div>
        ) : (
          <>
            <div className="mt-5 hidden overflow-hidden rounded-2xl border border-dash-border md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-dash-border bg-dash-surface">
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink sm:px-5">
                        {t('columns.timestamp')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.actor')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.eventType')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.target')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                        {t('columns.reason')}
                      </th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-ink sm:px-5">
                        <span className="sr-only">{t('columns.actions')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event, index) => (
                      <tr
                        key={event.id}
                        className={cn(
                          'border-b border-dash-border last:border-b-0',
                          'transition-colors duration-150',
                          index % 2 === 1 && 'bg-dash-surface/60'
                        )}
                      >
                        <td className="px-4 py-3.5 text-sm tabular-nums text-body sm:px-5">
                          {formatTimestamp(event.createdAt)}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-body">
                          {event.actorUserId || t('emptyValue')}
                        </td>
                        <td className="px-4 py-3.5 text-sm font-medium text-ink">
                          {event.eventType}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-body">
                          <span className="font-medium text-ink">{event.targetType}</span>
                          {event.targetId ? (
                            <span className="mt-0.5 block font-mono text-xs text-mute">
                              {event.targetId}
                            </span>
                          ) : null}
                        </td>
                        <td className="max-w-[14rem] truncate px-4 py-3.5 text-sm text-body">
                          {event.reason || t('emptyValue')}
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <ul className="mt-5 flex flex-col gap-3 md:hidden">
              {events.map((event) => (
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
                      {t('columns.actor')}:{' '}
                      <span className="font-mono">{event.actorUserId || t('emptyValue')}</span>
                    </p>
                    <p>
                      {t('columns.target')}: {event.targetType}
                      {event.targetId ? ` · ${event.targetId}` : ''}
                    </p>
                    {event.reason ? (
                      <p>
                        {t('columns.reason')}: {event.reason}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
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
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton>
          <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
            <DialogTitle>{t('details.title')}</DialogTitle>
            <DialogDescription>
              {selected?.eventType || t('details.fallbackEvent')}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-mute">{t('columns.timestamp')}</dt>
                  <dd className="text-right text-ink">{formatTimestamp(selected.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-mute">{t('columns.actor')}</dt>
                  <dd className="max-w-[60%] break-all text-right font-mono text-xs text-ink">
                    {selected.actorUserId || t('emptyValue')}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-mute">{t('columns.eventType')}</dt>
                  <dd className="text-right text-ink">{selected.eventType}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-mute">{t('details.targetType')}</dt>
                  <dd className="text-right text-ink">{selected.targetType}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-mute">{t('details.targetId')}</dt>
                  <dd className="max-w-[60%] break-all text-right font-mono text-xs text-ink">
                    {selected.targetId || t('emptyValue')}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-mute">{t('columns.reason')}</dt>
                  <dd className="max-w-[60%] text-right text-ink">
                    {selected.reason || t('emptyValue')}
                  </dd>
                </div>
              </dl>

              {selectedBefore ? (
                <div>
                  <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('details.before')}
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-xl border border-dash-border bg-dash-surface/50 p-3 font-mono text-xs text-ink">
                    {selectedBefore}
                  </pre>
                </div>
              ) : null}

              {selectedAfter ? (
                <div>
                  <p className="text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('details.after')}
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-xl border border-dash-border bg-dash-surface/50 p-3 font-mono text-xs text-ink">
                    {selectedAfter}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="border-t border-dash-border px-5 py-4 sm:px-6">
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
