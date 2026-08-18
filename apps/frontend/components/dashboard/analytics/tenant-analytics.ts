'use client'

import { api, type AuthorizationAuditEvent, type Campaign, type ContactSummary, type InboxConversation, type PaginationMeta, type TagRecord, type WhatsappConfigSummary, type WhatsappMessageTemplate } from '@/lib/api'
import { unwrapCampaignList, ratePercent } from '@/components/dashboard/campaigns/campaign-utils'
import { unwrapPaginated, unwrapList } from '@/components/dashboard/inbox/inbox-utils'
import { unwrapTemplateList } from '@/components/dashboard/templates/template-utils'

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

export type ConversationAggregate = {
  total: number
  unread: number
  statusBreakdown: BreakdownItem[]
}

export const tenantAnalyticsQueryKeys = {
  all: ['tenant-analytics'] as const,
  contacts: ['tenant-analytics', 'contacts'] as const,
  campaigns: ['tenant-analytics', 'campaigns'] as const,
  templates: ['tenant-analytics', 'templates'] as const,
  configs: ['tenant-analytics', 'configs'] as const,
  conversations: ['tenant-analytics', 'conversations'] as const,
  tags: ['tenant-analytics', 'tags'] as const,
  audit: ['tenant-analytics', 'audit'] as const,
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

export async function fetchAnalyticsContacts(): Promise<ContactSummary[]> {
  const { data } = await api.contacts.list()
  return unwrapList<ContactSummary>(data)
}

export async function fetchAnalyticsCampaigns(): Promise<Campaign[]> {
  return fetchAllByPages(async (page, perPage) => {
    const { data } = await api.campaigns.list({ page, perPage, sortBy: 'createdAt', sortOrder: 'desc' })
    return unwrapCampaignList(data)
  })
}

export async function fetchAnalyticsTemplates(): Promise<WhatsappMessageTemplate[]> {
  return fetchAllByPages(async (page, perPage) => {
    const { data } = await api.whatsapp.listTemplates({ page, perPage })
    return unwrapTemplateList(data)
  })
}

export async function fetchAnalyticsConfigs(): Promise<WhatsappConfigSummary[]> {
  const { data } = await api.whatsapp.listConfigs()
  return unwrapList<WhatsappConfigSummary>(data)
}

export async function fetchAnalyticsConversations(): Promise<InboxConversation[]> {
  return fetchAllByPages(async (page, perPage) => {
    const { data } = await api.inbox.listConversations({ page, limit: perPage })
    return unwrapPaginated<InboxConversation>(data)
  })
}

export async function fetchAnalyticsTags(): Promise<TagRecord[]> {
  const { data } = await api.tags.list()
  return unwrapList<TagRecord>(data)
}

export async function fetchAnalyticsAudit(): Promise<AuthorizationAuditEvent[]> {
  const { data } = await api.audit.list({ limit: 10 })
  return unwrapList<AuthorizationAuditEvent>(data)
}

export function buildMonthlySeries(
  values: Array<{ createdAt?: string | null }>,
  locale: string,
  months = 6
): AnalyticsMonthPoint[] {
  const now = new Date()
  const monthStarts: Date[] = []
  for (let i = months - 1; i >= 0; i -= 1) {
    monthStarts.push(new Date(now.getFullYear(), now.getMonth() - i, 1))
  }

  const counts = new Map<string, number>()
  for (const item of values) {
    if (!item.createdAt) continue
    const date = new Date(item.createdAt)
    if (Number.isNaN(date.getTime())) continue
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return monthStarts.map((date) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return {
      key,
      label: new Intl.DateTimeFormat(locale, { month: 'short' }).format(date),
      value: counts.get(key) ?? 0,
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

export function sumConversationMetrics(conversations: InboxConversation[]): ConversationAggregate {
  const byStatus = new Map<string, number>()
  let unread = 0

  for (const conversation of conversations) {
    const key = String(conversation.status || 'unknown').toLowerCase()
    byStatus.set(key, (byStatus.get(key) ?? 0) + 1)
    unread += Number(conversation.unreadCount ?? 0)
  }

  return {
    total: conversations.length,
    unread,
    statusBreakdown: Array.from(byStatus.entries())
      .map(([key, value]) => ({ key, label: key, value }))
      .sort((a, b) => b.value - a.value),
  }
}

export function buildBreakdown(values: string[]): BreakdownItem[] {
  const counts = new Map<string, number>()
  for (const raw of values) {
    const key = String(raw || 'unknown').toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([key, value]) => ({ key, label: key, value }))
    .sort((a, b) => b.value - a.value)
}

export function buildTemplateUsage(campaigns: Campaign[], templates: WhatsappMessageTemplate[]): BreakdownItem[] {
  const names = new Map<string, string>(templates.map((item) => [item.id, item.name]))
  const counts = new Map<string, BreakdownItem>()

  for (const campaign of campaigns) {
    if (!campaign.messageTemplateId) continue
    const key = campaign.messageTemplateId
    const current = counts.get(key)
    if (current) {
      current.value += 1
      continue
    }
    counts.set(key, {
      key,
      label: names.get(key) ?? key,
      value: 1,
    })
  }

  return Array.from(counts.values()).sort((a, b) => b.value - a.value)
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
