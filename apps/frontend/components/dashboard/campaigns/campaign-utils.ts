import type { Campaign, PaginationMeta } from '@/lib/api'

export type CampaignViewMode = 'cards' | 'list'

/** Matches `replaceCampaignRecipientsValidator` maxLength on the backend. */
export const CAMPAIGN_RECIPIENT_MAX = 5000

export const CAMPAIGN_STATUSES = [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'failed',
] as const

export type CampaignStatusKey = (typeof CAMPAIGN_STATUSES)[number]

export function unwrapCampaignList(data: unknown): {
  items: Campaign[]
  meta: PaginationMeta | null
} {
  if (!data) return { items: [], meta: null }
  if (Array.isArray(data)) return { items: data as Campaign[], meta: null }

  const root = data as {
    data?: Campaign[] | { data?: Campaign[]; meta?: PaginationMeta }
    meta?: PaginationMeta
  }

  if (Array.isArray(root.data)) {
    return { items: root.data, meta: root.meta ?? null }
  }

  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return {
      items: root.data.data,
      meta: root.data.meta ?? root.meta ?? null,
    }
  }

  return { items: [], meta: null }
}

export function unwrapCampaign(data: unknown): Campaign | null {
  if (!data) return null
  if (typeof data === 'object' && data !== null && 'id' in data && 'name' in data) {
    return data as Campaign
  }
  const wrapped = data as { data?: Campaign }
  return wrapped.data ?? null
}

export function ratePercent(part: number, total: number): number {
  if (!total || total <= 0) return 0
  return Math.round((part / total) * 1000) / 10
}

export function formatCampaignDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function isEditableCampaignStatus(status: string): boolean {
  return status === 'draft' || status === 'scheduled'
}

export function isLaunchableCampaignStatus(status: string): boolean {
  return status === 'draft' || status === 'scheduled'
}

export function isCancellableCampaignStatus(status: string): boolean {
  return status === 'scheduled' || status === 'sending'
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
