import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { MOCK_AUDIT_LOGS, type AuditLogStatus } from '../mock-data'

const STATUS_STYLES: Record<AuditLogStatus, string> = {
  success: 'bg-primary-pale text-positive-deep ring-1 ring-primary/30',
  warning: 'bg-dash-warn-soft text-warning-content ring-1 ring-warning/35',
  failed: 'bg-danger-soft text-danger ring-1 ring-danger/30',
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export async function PlatformAuditLogsPage() {
  const t = await getTranslations('admin.auditLogs')

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
          description={t('tableDescription', { count: MOCK_AUDIT_LOGS.length })}
        />

        <div className="mt-5 hidden overflow-hidden rounded-2xl border border-dash-border md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="border-b border-dash-border bg-dash-surface">
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink sm:px-5">
                    {t('columns.timestamp')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">{t('columns.user')}</th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                    {t('columns.action')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                    {t('columns.organization')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                    {t('columns.ipAddress')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink sm:px-5">
                    {t('columns.status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {MOCK_AUDIT_LOGS.map((log, index) => (
                  <tr
                    key={log.id}
                    className={cn(
                      'border-b border-dash-border last:border-b-0',
                      'transition-colors duration-150',
                      index % 2 === 1 && 'bg-dash-surface/60'
                    )}
                  >
                    <td className="px-4 py-3.5 text-sm tabular-nums text-body sm:px-5">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="px-4 py-3.5 text-sm font-medium text-ink">{log.user}</td>
                    <td className="px-4 py-3.5 text-sm text-body">{log.action}</td>
                    <td className="px-4 py-3.5 text-sm text-body">{log.organization}</td>
                    <td className="px-4 py-3.5 font-mono text-sm text-body">{log.ipAddress}</td>
                    <td className="px-4 py-3.5 sm:px-5">
                      <span
                        className={cn(
                          'inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold',
                          STATUS_STYLES[log.status]
                        )}
                      >
                        {t(`statuses.${log.status}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <ul className="mt-5 flex flex-col gap-3 md:hidden">
          {MOCK_AUDIT_LOGS.map((log) => (
            <li
              key={log.id}
              className="rounded-2xl border border-dash-border bg-dash-surface/60 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{log.user}</p>
                <span
                  className={cn(
                    'inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold',
                    STATUS_STYLES[log.status]
                  )}
                >
                  {t(`statuses.${log.status}`)}
                </span>
              </div>
              <p className="mt-1 text-xs text-mute">{formatTimestamp(log.timestamp)}</p>
              <p className="mt-3 text-sm text-body">{log.action}</p>
              <div className="mt-3 space-y-1 text-xs text-mute">
                <p>
                  {t('columns.organization')}: {log.organization}
                </p>
                <p>
                  {t('columns.ipAddress')}: <span className="font-mono">{log.ipAddress}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </DashboardPanel>
    </div>
  )
}
