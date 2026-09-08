'use client'

import {
  api,
  type AuthorizationAuditEvent,
  type Campaign,
  type PaginationMeta,
  type TenantAnalyticsSummary,
  type WhatsappConfigSummary,
} from '@/lib/api'
import { unwrapCampaignList, ratePercent } from '@/components/dashboard/campaigns/campaign-utils'
import { unwrapList } from '@/components/dashboard/inbox/inbox-utils'

export type AnalyticsMonthPoint = {
  key: string
  label: string
  value: number
}

export type BreakdownItem = {
  key: string
  label: string
  value: number
}

export type CampaignAggregate = {
  totalCampaigns: number
  totalRecipients: number
  sentCount: number
  deliveredCount: number
  readCount: number
  repliedCount: number
  failedCount: number
  deliveryRate: number
  statusBreakdown: BreakdownItem[]
}

async function fetchAllByPages<T>(fetchPage: (page: number, perPage: number) => Promise<{ items: T[]; meta: PaginationMeta | null }>): Promise<T[]> {
  const perPage = 100
  let page = 1
  let lastPage = 1
  const items: T[] = []
  let guard = 0

  do {
    guard += 1
    const result = await fetchPage(page, perPage)
    items.push(...result.items)
    lastPage = result.meta?.lastPage ?? page
    page += 1
  } while (page <= lastPage && guard < 50)

  return items
}

function unwrapObject<T extends object>(payload: unknown, marker: keyof T): T | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as { data?: T } & T
  if (root.data && typeof root.data === 'object' && marker in root.data) return root.data
  if (marker in root) return root as T
  return null
}

export async function fetchTenantAnalyticsSummary(): Promise<TenantAnalyticsSummary> {
  const { data } = await api.analytics.summary()
  const summary = unwrapObject<TenantAnalyticsSummary>(data, 'totalContacts')
  if (!summary) {
    throw new Error('Analytics summary was empty')
  }
  return summary
}

export async function fetchAnalyticsCampaigns(): Promise<Campaign[]> {
  return fetchAllByPages(async (page, perPage) => {
    const { data } = await api.campaigns.list({ page, perPage, sortBy: 'createdAt', sortOrder: 'desc' })
    return unwrapCampaignList(data)
  })
}

export async function fetchAnalyticsConfigs(): Promise<WhatsappConfigSummary[]> {
  const { data } = await api.whatsapp.listConfigs()
  return unwrapList<WhatsappConfigSummary>(data)
}

export async function fetchAnalyticsAudit(): Promise<AuthorizationAuditEvent[]> {
  const { data } = await api.audit.list({ limit: 10 })
  return unwrapList<AuthorizationAuditEvent>(data)
}

export async function fetchRecentCampaigns(limit = 10): Promise<Campaign[]> {
  const { data } = await api.campaigns.list({
    page: 1,
    perPage: limit,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  })
  return unwrapCampaignList(data).items
}

export function withMonthLabels<T extends { key: string }>(
  points: T[],
  locale: string
): Array<T & { label: string }> {
  return points.map((point) => {
    const [year, month] = point.key.split('-').map(Number)
    const date = new Date(Number.isFinite(year) ? year : 1970, (Number.isFinite(month) ? month : 1) - 1, 1)
    return {
      ...point,
      label: new Intl.DateTimeFormat(locale, { month: 'short' }).format(date),
    }
  })
}

export function sumCampaignMetrics(campaigns: Campaign[]): CampaignAggregate {
  const totalRecipients = campaigns.reduce((sum, item) => sum + Number(item.totalRecipients ?? 0), 0)
  const sentCount = campaigns.reduce((sum, item) => sum + Number(item.sentCount ?? 0), 0)
  const deliveredCount = campaigns.reduce((sum, item) => sum + Number(item.deliveredCount ?? 0), 0)
  const readCount = campaigns.reduce((sum, item) => sum + Number(item.readCount ?? 0), 0)
  const repliedCount = campaigns.reduce((sum, item) => sum + Number(item.repliedCount ?? 0), 0)
  const failedCount = campaigns.reduce((sum, item) => sum + Number(item.failedCount ?? 0), 0)

  const byStatus = new Map<string, number>()
  for (const campaign of campaigns) {
    const key = String(campaign.status || 'unknown').toLowerCase()
    byStatus.set(key, (byStatus.get(key) ?? 0) + 1)
  }

  const statusBreakdown = Array.from(byStatus.entries())
    .map(([key, value]) => ({ key, label: key, value }))
    .sort((a, b) => b.value - a.value)

  return {
    totalCampaigns: campaigns.length,
    totalRecipients,
    sentCount,
    deliveredCount,
    readCount,
    repliedCount,
    failedCount,
    deliveryRate: ratePercent(deliveredCount, sentCount),
    statusBreakdown,
  }
}

export function formatAnalyticsDate(value: string | null | undefined, locale?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function normalizeLabel(value: string): string {
  if (value === 'sent') return 'completed'
  if (value === 'draft') return 'draft'
  if (value === 'scheduled') return 'scheduled'
  if (value === 'failed') return 'failed'
  if (value === 'sending') return 'sending'
  if (value === 'open') return 'open'
  if (value === 'pending') return 'pending'
  if (value === 'closed') return 'closed'
  if (value === 'connected') return 'connected'
  if (value === 'disconnected') return 'disconnected'
  if (value === 'error') return 'error'
  if (value === 'approved') return 'approved'
  if (value === 'rejected') return 'rejected'
  if (value === 'utility') return 'utility'
  if (value === 'marketing') return 'marketing'
  if (value === 'authentication') return 'authentication'
  return value.replace(/_/g, ' ')
}
