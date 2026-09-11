import type { Campaign, PaginationMeta, WhatsappMessageTemplate } from '@/lib/api'
import { unwrapList, unwrapPage, unwrapSingle } from '@/lib/api-unwrap'
import { formatCampaignScheduledAt } from '@/lib/org-datetime'

export type CampaignViewMode = 'cards' | 'list'

/** Matches `replaceCampaignRecipientsValidator` maxLength on the backend. */
export const CAMPAIGN_RECIPIENT_MAX = 5000

export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'failed'] as const

export type CampaignStatusKey = (typeof CAMPAIGN_STATUSES)[number]

export const campaignQueryKeys = {
  all: ['campaigns'] as const,
  list: (orgId: string | null | undefined, params: Record<string, unknown>) =>
    [...campaignQueryKeys.all, 'list', orgId ?? 'none', params] as const,
  detail: (id: string) => [...campaignQueryKeys.all, 'detail', id] as const,
}

export function unwrapCampaignList(data: unknown): {
  items: Campaign[]
  meta: PaginationMeta | null
} {
  return unwrapPage<Campaign>(data)
}

export function unwrapCampaign(data: unknown): Campaign | null {
  return unwrapSingle<Campaign>(data)
}

export function unwrapTemplateItems(data: unknown): WhatsappMessageTemplate[] {
  return unwrapList<WhatsappMessageTemplate>(data)
}

export function ratePercent(part: number, total: number): number {
  if (!total || total <= 0) return 0
  return Math.round((part / total) * 1000) / 10
}

/** Format a campaign timestamp in UTC and label it. */
export function formatCampaignDate(value: string | null | undefined): string {
  if (!value) return '—'
  const formatted = formatCampaignScheduledAt(value)
  return formatted ? `${formatted} UTC` : '—'
}

/** Content/audience edits are draft-only; scheduled campaigns must be cancelled first. */
export function isEditableCampaignStatus(status: string): boolean {
  return status === 'draft'
}

/** Send now / Launch is draft-only; scheduled campaigns use Cancel + Reschedule. */
export function isLaunchableCampaignStatus(status: string): boolean {
  return status === 'draft'
}

export function isCancellableCampaignStatus(status: string): boolean {
  return status === 'scheduled' || status === 'sending'
}

export function isReschedulableCampaignStatus(status: string): boolean {
  return status === 'scheduled'
}

/** Client-side date range filter when API has no start/end params. */
export function filterCampaignsByDateRange(
  items: Campaign[],
  startDate: string,
  endDate: string
): Campaign[] {
  if (!startDate && !endDate) return items
  const start = startDate ? new Date(`${startDate}T00:00:00`) : null
  const end = endDate ? new Date(`${endDate}T23:59:59.999`) : null
  return items.filter((item) => {
    const raw = item.createdAt ?? item.scheduledAt
    if (!raw) return false
    const created = new Date(raw)
    if (Number.isNaN(created.getTime())) return false
    if (start && created < start) return false
    if (end && created > end) return false
    return true
  })
}
