'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, BarChart3, CheckCheck, MessageCircle, Phone, Send, Tags, Users, XCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { usePermissions } from '@/hooks/usePermissions'
import { PERMISSIONS } from '@/lib/rbac'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { DashboardEmptyState } from '@/components/dashboard/overview/DashboardEmptyState'
import { KPIStatCard } from '@/components/dashboard/overview/KPIStatCard'
import { ActivityItem, type ActivityTone } from '@/components/dashboard/overview/ActivityItem'
import type { TagRecord, WhatsappConfigSummary } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import {
  buildBreakdown,
  buildMonthlySeries,
  buildTemplateUsage,
  fetchAnalyticsAudit,
  fetchAnalyticsCampaigns,
  fetchAnalyticsConfigs,
  fetchAnalyticsContacts,
  fetchAnalyticsConversations,
  fetchAnalyticsTags,
  fetchAnalyticsTemplates,
  formatAnalyticsDate,
  normalizeLabel,
  sumCampaignMetrics,
  sumConversationMetrics,
  type AnalyticsMonthPoint,
  type BreakdownItem,
} from './tenant-analytics'

function PanelLoading({ label }: { label: string }) {
  return <div className="mt-5 flex min-h-48 items-center justify-center text-sm text-mute">{label}</div>
}

function PanelError({
  label,
  retryLabel,
  retry,
}: {
  label: string
  retryLabel: string
  retry?: () => void
}) {
  return (
    <div className="mt-5 flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border bg-dash-surface/40 px-6 py-12 text-center">
      <p className="text-sm text-body">{label}</p>
      {retry ? (
        <Button variant="outline" size="sm" onClick={retry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}

function PanelUnavailable({ label }: { label: string }) {
  return <div className="mt-5 flex min-h-48 items-center justify-center text-sm text-mute">{label}</div>
}

function PercentageBarList({
  items,
  emptyLabel,
  translateLabel,
}: {
  items: BreakdownItem[]
  emptyLabel: string
  translateLabel: (key: string) => string
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0)

  if (items.length === 0 || total === 0) {
    return <div className="mt-5 text-sm text-mute">{emptyLabel}</div>
  }

  return (
    <ul className="mt-5 flex flex-col gap-3">
      {items.map((item) => {
        const percent = total > 0 ? Math.round((item.value / total) * 100) : 0
        return (
          <li key={item.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-ink">{translateLabel(item.key)}</span>
              <span className="shrink-0 tabular-nums text-mute">
                {item.value} ({percent}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-dash-surface">
              <div
                className="h-2 rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function MonthlyBarChart({
  points,
  emptyLabel,
}: {
  points: AnalyticsMonthPoint[]
  emptyLabel: string
}) {
  const max = Math.max(...points.map((point) => point.value), 0)

  if (points.length === 0) {
    return <div className="mt-5 text-sm text-mute">{emptyLabel}</div>
  }

  return (
    <div className="mt-6 grid grid-cols-6 gap-3">
      {points.map((point) => {
        const height = max > 0 ? Math.max(12, Math.round((point.value / max) * 120)) : 12
        return (
          <div key={point.key} className="flex min-w-0 flex-col items-center gap-2">
            <div className="text-xs tabular-nums text-mute">{point.value}</div>
            <div className="flex h-32 w-full items-end justify-center rounded-2xl bg-dash-surface/60 px-1.5 py-2">
              <div
                className="w-full rounded-xl bg-primary/85"
                style={{ height }}
                aria-hidden
                title={`${point.label}: ${point.value}`}
              />
            </div>
            <div className="truncate text-xs font-medium text-mute">{point.label}</div>
          </div>
        )
      })}
    </div>
  )
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-dash-border bg-dash-surface/40 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-mute">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  )
}

export function OrganizationAnalyticsPage() {
  const t = useTranslations('dashboard.analytics')
  const locale = useLocale()
  const { hasPermission, hasAnyPermission } = usePermissions()

  const canViewContacts = hasPermission(PERMISSIONS.CONTACTS_VIEW)
  const canViewCampaigns = hasPermission(PERMISSIONS.CAMPAIGNS_VIEW)
  const canViewInbox = hasPermission(PERMISSIONS.INBOX_VIEW)
  const canViewWhatsapp = hasPermission(PERMISSIONS.WHATSAPP_VIEW)
  const canViewTemplates = hasAnyPermission([PERMISSIONS.TEMPLATES_VIEW, PERMISSIONS.WHATSAPP_VIEW])
  const canViewAudit = hasPermission(PERMISSIONS.AUDIT_VIEW)

  const contactsQuery = useQuery({
    queryKey: queryKeys.analytics.contacts,
    queryFn: fetchAnalyticsContacts,
    enabled: canViewContacts,
    staleTime: 60_000,
  })

  const campaignsQuery = useQuery({
    queryKey: queryKeys.analytics.campaigns,
    queryFn: fetchAnalyticsCampaigns,
    enabled: canViewCampaigns,
    staleTime: 60_000,
  })

  const configsQuery = useQuery({
    queryKey: queryKeys.analytics.configs,
    queryFn: fetchAnalyticsConfigs,
    enabled: canViewWhatsapp,
    staleTime: 60_000,
  })

  const templatesQuery = useQuery({
    queryKey: queryKeys.analytics.templates,
    queryFn: fetchAnalyticsTemplates,
    enabled: canViewTemplates,
    staleTime: 60_000,
  })

  const conversationsQuery = useQuery({
    queryKey: queryKeys.analytics.conversations,
    queryFn: fetchAnalyticsConversations,
    enabled: canViewInbox,
    staleTime: 60_000,
  })

  const tagsQuery = useQuery({
    queryKey: queryKeys.analytics.tags,
    queryFn: fetchAnalyticsTags,
    enabled: canViewContacts,
    staleTime: 60_000,
  })

  const auditQuery = useQuery({
    queryKey: queryKeys.analytics.audit,
    queryFn: fetchAnalyticsAudit,
    enabled: canViewAudit,
    staleTime: 60_000,
  })

  const contacts = useMemo(() => contactsQuery.data ?? [], [contactsQuery.data])
  const campaigns = useMemo(() => campaignsQuery.data ?? [], [campaignsQuery.data])
  const configs = useMemo(() => configsQuery.data ?? [], [configsQuery.data])
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data])
  const conversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data])
  const tags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data])
  const audits = useMemo(() => auditQuery.data ?? [], [auditQuery.data])

  const contactGrowth = useMemo(() => buildMonthlySeries(contacts, locale, 6), [contacts, locale])
  const campaignMetrics = useMemo(() => sumCampaignMetrics(campaigns), [campaigns])
  const conversationMetrics = useMemo(() => sumConversationMetrics(conversations), [conversations])
  const configStatusBreakdown = useMemo(
    () => buildBreakdown(configs.map((config) => String(config.status))),
    [configs]
  )
  const templateStatusBreakdown = useMemo(
    () => buildBreakdown(templates.map((template) => String(template.status))),
    [templates]
  )
  const templateCategoryBreakdown = useMemo(
    () => buildBreakdown(templates.map((template) => String(template.category))),
    [templates]
  )
  const templateUsage = useMemo(() => buildTemplateUsage(campaigns, templates).slice(0, 5), [campaigns, templates])
  const topGroups = useMemo(
    () => [...tags].sort((a, b) => Number(b.contactCount ?? 0) - Number(a.contactCount ?? 0)).slice(0, 5),
    [tags]
  )
  const campaignRows = useMemo(
    () =>
      [...campaigns]
        .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
        .slice(0, 10),
    [campaigns]
  )
  const connectedCount = useMemo(
    () => configs.filter((config) => String(config.status).toLowerCase() === 'connected').length,
    [configs]
  )

  function translationForBreakdown(
    group: 'campaignStatus' | 'conversationStatus' | 'whatsappStatus' | 'templateStatus' | 'templateCategory',
    key: string
  ) {
    const labelFallback = normalizeLabel(key)
    const normalized = normalizeLabel(key).replace(/ /g, '')

    const campaignStatusKeys = new Set(['draft', 'scheduled', 'sending', 'completed', 'failed', 'cancelled'])
    const conversationStatusKeys = new Set(['open', 'pending', 'closed'])
    const whatsappStatusKeys = new Set(['connected', 'disconnected', 'error'])
    const templateStatusKeys = new Set([
      'approved',
      'pending',
      'rejected',
      'draft',
      'deleted',
      'paused',
      'disabled',
    ])
    const templateCategoryKeys = new Set(['marketing', 'utility', 'authentication'])

    if (group === 'campaignStatus' && campaignStatusKeys.has(normalized)) {
      return t(`labels.campaignStatus.${normalized}`)
    }
    if (group === 'conversationStatus' && conversationStatusKeys.has(normalized)) {
      return t(`labels.conversationStatus.${normalized}`)
    }
    if (group === 'whatsappStatus' && whatsappStatusKeys.has(normalized)) {
      return t(`labels.whatsappStatus.${normalized}`)
    }
    if (group === 'templateStatus' && templateStatusKeys.has(normalized)) {
      return t(`labels.templateStatus.${normalized}`)
    }
    if (group === 'templateCategory' && templateCategoryKeys.has(normalized)) {
      return t(`labels.templateCategory.${normalized}`)
    }

    return labelFallback
  }

  const auditItems = useMemo(
    () =>
      audits.map((event) => {
        const detailBits = [event.actorName, event.organizationName, event.reason].filter(Boolean)
        return {
          id: event.id,
          title: event.eventType,
          detail: detailBits.join(' - ') || t('audit.noDetails'),
          timestamp: event.createdAt,
          tone: (event.granted === false
            ? 'amber'
            : event.granted === true
              ? 'green'
              : 'neutral') as ActivityTone,
        }
      }),
    [audits, t]
  )

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6 xl:gap-7">
      <DashboardPanel
        as="section"
        className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-primary-pale/80 blur-[70px]"
        />
        <div className="relative">
          <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">{t('eyebrow')}</p>
          <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-body sm:text-base sm:leading-7">
            {t('subtitle')}
          </p>
        </div>
      </DashboardPanel>

      <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
        <KPIStatCard
          label={t('kpis.totalContacts')}
          value={canViewContacts ? contacts.length : t('unavailable')}
          format={canViewContacts ? 'number' : 'plain'}
          icon={Users}
          loading={canViewContacts && contactsQuery.isLoading}
          className="h-full"
        />
        <KPIStatCard
          label={t('kpis.totalCampaigns')}
          value={canViewCampaigns ? campaignMetrics.totalCampaigns : t('unavailable')}
          format={canViewCampaigns ? 'number' : 'plain'}
          icon={BarChart3}
          loading={canViewCampaigns && campaignsQuery.isLoading}
          className="h-full"
        />
        <KPIStatCard
          label={t('kpis.sentMessages')}
          value={canViewCampaigns ? campaignMetrics.sentCount : t('unavailable')}
          format={canViewCampaigns ? 'number' : 'plain'}
          icon={Send}
          loading={canViewCampaigns && campaignsQuery.isLoading}
          className="h-full"
        />
        <KPIStatCard
          label={t('kpis.deliveredMessages')}
          value={canViewCampaigns ? campaignMetrics.deliveredCount : t('unavailable')}
          format={canViewCampaigns ? 'number' : 'plain'}
          icon={CheckCheck}
          loading={canViewCampaigns && campaignsQuery.isLoading}
          className="h-full"
        />
        <KPIStatCard
          label={t('kpis.failedMessages')}
          value={canViewCampaigns ? campaignMetrics.failedCount : t('unavailable')}
          format={canViewCampaigns ? 'number' : 'plain'}
          icon={XCircle}
          loading={canViewCampaigns && campaignsQuery.isLoading}
          className="h-full"
        />
        <KPIStatCard
          label={t('kpis.deliveryRate')}
          value={canViewCampaigns ? campaignMetrics.deliveryRate : t('unavailable')}
          format={canViewCampaigns ? 'percent' : 'plain'}
          suffix={canViewCampaigns ? '%' : undefined}
          icon={Send}
          loading={canViewCampaigns && campaignsQuery.isLoading}
          className="h-full"
        />
        <KPIStatCard
          label={t('kpis.totalConversations')}
          value={canViewInbox ? conversationMetrics.total : t('unavailable')}
          format={canViewInbox ? 'number' : 'plain'}
          icon={MessageCircle}
          loading={canViewInbox && conversationsQuery.isLoading}
          className="h-full"
        />
        <KPIStatCard
          label={t('kpis.connectedWhatsappNumbers')}
          value={canViewWhatsapp ? connectedCount : t('unavailable')}
          format={canViewWhatsapp ? 'number' : 'plain'}
          icon={Phone}
          loading={canViewWhatsapp && configsQuery.isLoading}
          className="h-full"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-12 xl:gap-6">
        <DashboardPanel as="section" className="min-w-0 p-4 sm:p-5 md:p-6 xl:col-span-7">
          <DashboardSectionHeader
            title={t('contacts.title')}
            description={t('contacts.description')}
          />
          {!canViewContacts ? (
            <PanelUnavailable label={t('unavailable')} />
          ) : contactsQuery.isLoading ? (
            <PanelLoading label={t('loading.contacts')} />
          ) : contactsQuery.isError ? (
            <PanelError label={t('errors.contacts')} retryLabel={t('retry')} retry={() => void contactsQuery.refetch()} />
          ) : contacts.length === 0 ? (
            <DashboardEmptyState title={t('contacts.emptyTitle')} description={t('contacts.emptyDescription')} icon={<Users className="size-5" aria-hidden />} />
          ) : (
            <>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SummaryPill label={t('contacts.totalContacts')} value={contacts.length.toLocaleString()} />
                <SummaryPill label={t('contacts.monthsTracked')} value={String(contactGrowth.length)} />
              </div>
              <MonthlyBarChart points={contactGrowth} emptyLabel={t('contacts.emptyChart')} />
            </>
          )}
        </DashboardPanel>

        <DashboardPanel as="section" className="min-w-0 p-4 sm:p-5 md:p-6 xl:col-span-5">
          <DashboardSectionHeader
            title={t('campaignStatus.title')}
            description={t('campaignStatus.description')}
          />
          {!canViewCampaigns ? (
            <PanelUnavailable label={t('unavailable')} />
          ) : campaignsQuery.isLoading ? (
            <PanelLoading label={t('loading.campaigns')} />
          ) : campaignsQuery.isError ? (
            <PanelError label={t('errors.campaigns')} retryLabel={t('retry')} retry={() => void campaignsQuery.refetch()} />
          ) : campaigns.length === 0 ? (
            <DashboardEmptyState title={t('campaignStatus.emptyTitle')} description={t('campaignStatus.emptyDescription')} icon={<BarChart3 className="size-5" aria-hidden />} />
          ) : (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <SummaryPill label={t('campaignStatus.totalRecipients')} value={campaignMetrics.totalRecipients.toLocaleString()} />
                <SummaryPill label={t('campaignStatus.completedCount')} value={String(campaignMetrics.statusBreakdown.find((item) => item.key === 'sent')?.value ?? 0)} />
              </div>
              <PercentageBarList
                items={campaignMetrics.statusBreakdown}
                emptyLabel={t('campaignStatus.emptyChart')}
                translateLabel={(key) => translationForBreakdown('campaignStatus', key)}
              />
            </>
          )}
        </DashboardPanel>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-12 xl:gap-6">
        <DashboardPanel as="section" className="min-w-0 p-4 sm:p-5 md:p-6 xl:col-span-7">
          <DashboardSectionHeader
            title={t('messagePerformance.title')}
            description={t('messagePerformance.description')}
          />
          {!canViewCampaigns ? (
            <PanelUnavailable label={t('unavailable')} />
          ) : campaignsQuery.isLoading ? (
            <PanelLoading label={t('loading.campaigns')} />
          ) : campaignsQuery.isError ? (
            <PanelError label={t('errors.campaigns')} retryLabel={t('retry')} retry={() => void campaignsQuery.refetch()} />
          ) : campaignMetrics.sentCount === 0 && campaignMetrics.deliveredCount === 0 && campaignMetrics.readCount === 0 && campaignMetrics.failedCount === 0 ? (
            <DashboardEmptyState title={t('messagePerformance.emptyTitle')} description={t('messagePerformance.emptyDescription')} icon={<Send className="size-5" aria-hidden />} />
          ) : (
            <PercentageBarList
              items={[
                { key: 'sent', label: 'sent', value: campaignMetrics.sentCount },
                { key: 'delivered', label: 'delivered', value: campaignMetrics.deliveredCount },
                { key: 'read', label: 'read', value: campaignMetrics.readCount },
                { key: 'failed', label: 'failed', value: campaignMetrics.failedCount },
              ]}
              emptyLabel={t('messagePerformance.emptyDescription')}
              translateLabel={(key) => t(`labels.messagePerformance.${key}`)}
            />
          )}
        </DashboardPanel>

        <DashboardPanel as="section" className="min-w-0 p-4 sm:p-5 md:p-6 xl:col-span-5">
          <DashboardSectionHeader
            title={t('conversations.title')}
            description={t('conversations.description')}
          />
          {!canViewInbox ? (
            <PanelUnavailable label={t('unavailable')} />
          ) : conversationsQuery.isLoading ? (
            <PanelLoading label={t('loading.conversations')} />
          ) : conversationsQuery.isError ? (
            <PanelError label={t('errors.conversations')} retryLabel={t('retry')} retry={() => void conversationsQuery.refetch()} />
          ) : conversations.length === 0 ? (
            <DashboardEmptyState title={t('conversations.emptyTitle')} description={t('conversations.emptyDescription')} icon={<MessageCircle className="size-5" aria-hidden />} />
          ) : (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <SummaryPill label={t('conversations.totalConversations')} value={conversationMetrics.total.toLocaleString()} />
                <SummaryPill label={t('conversations.unreadMessages')} value={conversationMetrics.unread.toLocaleString()} />
              </div>
              <PercentageBarList
                items={conversationMetrics.statusBreakdown}
                emptyLabel={t('conversations.emptyChart')}
                translateLabel={(key) => translationForBreakdown('conversationStatus', key)}
              />
            </>
          )}
        </DashboardPanel>
      </div>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader
          title={t('campaignPerformance.title')}
          description={t('campaignPerformance.description')}
        />
        {!canViewCampaigns ? (
          <PanelUnavailable label={t('unavailable')} />
        ) : campaignsQuery.isLoading ? (
          <PanelLoading label={t('loading.campaigns')} />
        ) : campaignsQuery.isError ? (
          <PanelError label={t('errors.campaigns')} retryLabel={t('retry')} retry={() => void campaignsQuery.refetch()} />
        ) : campaignRows.length === 0 ? (
          <DashboardEmptyState title={t('campaignPerformance.emptyTitle')} description={t('campaignPerformance.emptyDescription')} icon={<BarChart3 className="size-5" aria-hidden />} />
        ) : (
          <div className="mt-5 overflow-hidden rounded-2xl border border-dash-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-dash-border bg-dash-surface">
                    <th className="px-4 py-3 text-sm font-semibold text-ink">{t('campaignPerformance.columns.name')}</th>
                    <th className="px-4 py-3 text-sm font-semibold text-ink">{t('campaignPerformance.columns.status')}</th>
                    <th className="px-4 py-3 text-sm font-semibold text-ink">{t('campaignPerformance.columns.recipients')}</th>
                    <th className="px-4 py-3 text-sm font-semibold text-ink">{t('campaignPerformance.columns.sent')}</th>
                    <th className="px-4 py-3 text-sm font-semibold text-ink">{t('campaignPerformance.columns.delivered')}</th>
                    <th className="px-4 py-3 text-sm font-semibold text-ink">{t('campaignPerformance.columns.read')}</th>
                    <th className="px-4 py-3 text-sm font-semibold text-ink">{t('campaignPerformance.columns.replies')}</th>
                    <th className="px-4 py-3 text-sm font-semibold text-ink">{t('campaignPerformance.columns.failed')}</th>
                    <th className="px-4 py-3 text-sm font-semibold text-ink">{t('campaignPerformance.columns.created')}</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignRows.map((campaign, index) => (
                    <tr
                      key={campaign.id}
                      className={cn(
                        'border-b border-dash-border last:border-b-0',
                        index % 2 === 1 && 'bg-dash-surface/40'
                      )}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-ink">{campaign.name}</td>
                      <td className="px-4 py-3 text-sm text-body">
                        {translationForBreakdown('campaignStatus', String(campaign.status))}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-body">{Number(campaign.totalRecipients ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-body">{Number(campaign.sentCount ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-body">{Number(campaign.deliveredCount ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-body">{Number(campaign.readCount ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-body">{Number(campaign.repliedCount ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-body">{Number(campaign.failedCount ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-body">{formatAnalyticsDate(campaign.createdAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DashboardPanel>

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-12 xl:gap-6">
        <DashboardPanel as="section" className="min-w-0 p-4 sm:p-5 md:p-6 xl:col-span-4">
          <DashboardSectionHeader title={t('whatsapp.title')} description={t('whatsapp.description')} />
          {!canViewWhatsapp ? (
            <PanelUnavailable label={t('unavailable')} />
          ) : configsQuery.isLoading ? (
            <PanelLoading label={t('loading.whatsapp')} />
          ) : configsQuery.isError ? (
            <PanelError label={t('errors.whatsapp')} retryLabel={t('retry')} retry={() => void configsQuery.refetch()} />
          ) : configs.length === 0 ? (
            <DashboardEmptyState title={t('whatsapp.emptyTitle')} description={t('whatsapp.emptyDescription')} icon={<Phone className="size-5" aria-hidden />} />
          ) : (
            <>
              <div className="mt-5 grid grid-cols-1 gap-3">
                <SummaryPill label={t('whatsapp.connectedNumbers')} value={connectedCount.toLocaleString()} />
              </div>
              <PercentageBarList
                items={configStatusBreakdown}
                emptyLabel={t('whatsapp.emptyChart')}
                translateLabel={(key) => translationForBreakdown('whatsappStatus', key)}
              />
              <ul className="mt-5 flex flex-col gap-2 text-sm text-body">
                {configs.slice(0, 5).map((config: WhatsappConfigSummary) => (
                  <li key={config.id} className="flex items-center justify-between gap-3 rounded-xl border border-dash-border bg-dash-surface/40 px-3 py-2">
                    <span className="truncate text-ink">
                      {config.displayPhoneNumber?.trim() || config.phoneNumberId}
                    </span>
                    <span className="shrink-0 text-mute">
                      {translationForBreakdown('whatsappStatus', String(config.status))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DashboardPanel>

        <DashboardPanel as="section" className="min-w-0 p-4 sm:p-5 md:p-6 xl:col-span-4">
          <DashboardSectionHeader title={t('templates.title')} description={t('templates.description')} />
          {!canViewTemplates ? (
            <PanelUnavailable label={t('unavailable')} />
          ) : templatesQuery.isLoading ? (
            <PanelLoading label={t('loading.templates')} />
          ) : templatesQuery.isError ? (
            <PanelError label={t('errors.templates')} retryLabel={t('retry')} retry={() => void templatesQuery.refetch()} />
          ) : templates.length === 0 ? (
            <DashboardEmptyState title={t('templates.emptyTitle')} description={t('templates.emptyDescription')} icon={<Send className="size-5" aria-hidden />} />
          ) : (
            <>
              <div className="mt-5 grid grid-cols-1 gap-3">
                <SummaryPill label={t('templates.totalTemplates')} value={templates.length.toLocaleString()} />
              </div>
              <div className="mt-5">
                <p className="text-sm font-semibold text-ink">{t('templates.statusDistribution')}</p>
                <PercentageBarList
                  items={templateStatusBreakdown}
                  emptyLabel={t('templates.emptyChart')}
                  translateLabel={(key) => translationForBreakdown('templateStatus', key)}
                />
              </div>
              <div className="mt-5">
                <p className="text-sm font-semibold text-ink">{t('templates.categoryDistribution')}</p>
                <PercentageBarList
                  items={templateCategoryBreakdown}
                  emptyLabel={t('templates.emptyChart')}
                  translateLabel={(key) => translationForBreakdown('templateCategory', key)}
                />
              </div>
              {templateUsage.length > 0 ? (
                <div className="mt-5">
                  <p className="text-sm font-semibold text-ink">{t('templates.usageTitle')}</p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {templateUsage.map((item) => (
                      <li key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-dash-border bg-dash-surface/40 px-3 py-2 text-sm">
                        <span className="truncate text-ink">{item.label}</span>
                        <span className="shrink-0 tabular-nums text-mute">{item.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </DashboardPanel>

        <DashboardPanel as="section" className="min-w-0 p-4 sm:p-5 md:p-6 xl:col-span-4">
          <DashboardSectionHeader title={t('groups.title')} description={t('groups.description')} />
          {!canViewContacts ? (
            <PanelUnavailable label={t('unavailable')} />
          ) : tagsQuery.isLoading ? (
            <PanelLoading label={t('loading.groups')} />
          ) : tagsQuery.isError ? (
            <PanelError label={t('errors.groups')} retryLabel={t('retry')} retry={() => void tagsQuery.refetch()} />
          ) : tags.length === 0 ? (
            <DashboardEmptyState title={t('groups.emptyTitle')} description={t('groups.emptyDescription')} icon={<Tags className="size-5" aria-hidden />} />
          ) : (
            <>
              <div className="mt-5 grid grid-cols-1 gap-3">
                <SummaryPill label={t('groups.totalGroups')} value={tags.length.toLocaleString()} />
              </div>
              <ul className="mt-5 flex flex-col gap-2">
                {topGroups.map((group: TagRecord) => (
                  <li key={group.id} className="flex items-center justify-between gap-3 rounded-xl border border-dash-border bg-dash-surface/40 px-3 py-2 text-sm">
                    <span className="truncate text-ink">{group.name}</span>
                    <span className="shrink-0 tabular-nums text-mute">
                      {t('groups.contactsCount', { count: Number(group.contactCount ?? 0) })}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DashboardPanel>
      </div>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader title={t('audit.title')} description={t('audit.description')} />
        {!canViewAudit ? (
          <PanelUnavailable label={t('unavailable')} />
        ) : auditQuery.isLoading ? (
          <PanelLoading label={t('loading.audit')} />
        ) : auditQuery.isError ? (
          <PanelError label={t('errors.audit')} retryLabel={t('retry')} retry={() => void auditQuery.refetch()} />
        ) : auditItems.length === 0 ? (
          <DashboardEmptyState title={t('audit.emptyTitle')} description={t('audit.emptyDescription')} icon={<Activity className="size-5" aria-hidden />} />
        ) : (
          <ol className="mt-6 flex flex-1 flex-col">
            {auditItems.map((item, index) => (
              <li key={item.id}>
                <ActivityItem
                  id={item.id}
                  title={item.title}
                  detail={item.detail}
                  timestamp={item.timestamp}
                  tone={item.tone}
                  isLast={index === auditItems.length - 1}
                />
              </li>
            ))}
          </ol>
        )}
      </DashboardPanel>
    </div>
  )
}
