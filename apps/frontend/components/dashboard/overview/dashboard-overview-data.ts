import {
  api,
  type AuthorizationAuditEvent,
  type Campaign,
  type InboxConversation,
} from '@/lib/api'
import { ratePercent } from '@/components/dashboard/campaigns/campaign-utils'
import { unwrapPaginated, unwrapList } from '@/components/dashboard/inbox/inbox-utils'
import {
  fetchRecentCampaigns,
  fetchTenantAnalyticsSummary,
} from '@/components/dashboard/analytics/tenant-analytics'
import type { ActivityTone } from './ActivityItem'
import type { CampaignStatus } from './CampaignCard'
import type { ConversationStatus } from './ConversationRow'

export const RECENT_CONVERSATIONS_LIMIT = 5
export const RECENT_CAMPAIGNS_LIMIT = 5
export const RECENT_ACTIVITY_LIMIT = 10

export type DashboardOverviewKpis = {
  contactsCount: number
  conversationsCount: number
  campaignsCount: number
  deliveryRate: number
}

export type DashboardAuditActivityItem = {
  id: string
  title: string
  detail: string
  timestamp: string | Date
  tone: ActivityTone
}

export function mapConversationStatus(status: string): ConversationStatus {
  const normalized = status.toLowerCase()
  if (normalized === 'pending') return 'waiting'
  if (normalized === 'closed') return 'resolved'
  return 'open'
}

export function mapCampaignCardStatus(status: string): CampaignStatus {
  const normalized = status.toLowerCase()
  if (normalized === 'scheduled') return 'scheduled'
  if (normalized === 'draft') return 'draft'
  return 'sent'
}

export function campaignCardProgress(campaign: Campaign): number {
  const total = Number(campaign.totalRecipients ?? 0)
  if (total <= 0) return 0

  const normalized = String(campaign.status || '').toLowerCase()
  if (normalized === 'scheduled') return 100
  if (normalized === 'draft') return 0

  return ratePercent(Number(campaign.sentCount ?? 0), total)
}

export function campaignCardDeliveryPercent(campaign: Campaign): number | null {
  const sent = Number(campaign.sentCount ?? 0)
  if (sent <= 0) return null
  return ratePercent(Number(campaign.deliveredCount ?? 0), sent)
}

export function conversationDisplayName(conversation: InboxConversation): string {
  const contact = conversation.contact
  return contact?.name?.trim() || contact?.phone || '—'
}

export function buildAuditActivityItems(
  events: AuthorizationAuditEvent[],
  noDetailsLabel: string
): DashboardAuditActivityItem[] {
  return events.map((event) => {
    const detailBits = [event.actorName, event.organizationName, event.reason].filter(Boolean)
    return {
      id: event.id,
      title: event.eventType,
      detail: detailBits.join(' · ') || noDetailsLabel,
      timestamp: event.createdAt,
      tone:
        event.granted === false ? 'amber' : event.granted === true ? 'green' : 'neutral',
    }
  })
}

export async function fetchOverviewKpis(): Promise<DashboardOverviewKpis> {
  const summary = await fetchTenantAnalyticsSummary()
  return {
    contactsCount: summary.totalContacts,
    conversationsCount: summary.totalConversations,
    campaignsCount: summary.totalCampaigns,
    deliveryRate: summary.deliveryRate,
  }
}

export async function fetchOverviewConversations(): Promise<{
  items: InboxConversation[]
  total: number
}> {
  const { data } = await api.inbox.listConversations({
    page: 1,
    limit: RECENT_CONVERSATIONS_LIMIT,
  })
  const { items, meta } = unwrapPaginated<InboxConversation>(data)
  return {
    items,
    total: meta?.total ?? items.length,
  }
}

/** Recent campaigns list only — KPIs come from fetchOverviewKpis (analytics summary). */
export async function fetchOverviewCampaigns(): Promise<Campaign[]> {
  return fetchRecentCampaigns(RECENT_CAMPAIGNS_LIMIT)
}

export async function fetchOverviewAudit(): Promise<AuthorizationAuditEvent[]> {
  const { data } = await api.audit.list({ limit: RECENT_ACTIVITY_LIMIT })
  return unwrapList<AuthorizationAuditEvent>(data)
}
