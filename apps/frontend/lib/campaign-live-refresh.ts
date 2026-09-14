export const CAMPAIGN_IN_FLIGHT_REFETCH_MS = 2_000
export const CAMPAIGN_RECEIPT_REFETCH_MS = 15_000
export const CAMPAIGN_RECEIPT_WINDOW_MS = 30 * 60_000

export type CampaignLiveRefreshInput = {
  status: string
  sentCount: number
  failedCount: number
  deliveredCount: number
  totalRecipients: number
  finalizedAt?: string | Date | null
  updatedAt?: string | Date | null
}

export type CampaignLiveRefreshMode = 'in_flight' | 'receipt_window' | 'idle'

function asCount(value: number | null | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Whether a campaign still needs a live poll.
 *
 * In-flight: dispatch is scheduled/sending, or a `sent` campaign still has
 * unaccounted recipients (sentCount + failedCount < total). Drafts/cancelled
 * do not poll even when counts are incomplete.
 *
 * Receipt window: Meta accepted every send (`sent`) but deliveredCount has not
 * caught up, and finalize is younger than 30 minutes.
 */
export function campaignLiveRefreshMode(
  campaign: CampaignLiveRefreshInput | null | undefined,
  now = Date.now()
): CampaignLiveRefreshMode {
  if (!campaign) return 'idle'

  const status = String(campaign.status || '').toLowerCase()
  const sentCount = asCount(campaign.sentCount)
  const failedCount = asCount(campaign.failedCount)
  const deliveredCount = asCount(campaign.deliveredCount)
  const totalRecipients = asCount(campaign.totalRecipients)

  if (status === 'sending' || status === 'scheduled') {
    return 'in_flight'
  }

  if (status === 'sent' && sentCount + failedCount < totalRecipients) {
    return 'in_flight'
  }

  if (status === 'sent' && deliveredCount < sentCount) {
    const stamp = campaign.finalizedAt ?? campaign.updatedAt
    if (stamp) {
      const at = new Date(stamp).getTime()
      if (Number.isFinite(at) && now - at < CAMPAIGN_RECEIPT_WINDOW_MS) {
        return 'receipt_window'
      }
    }
  }

  return 'idle'
}

export function campaignsLiveRefreshMode(
  campaigns: Array<CampaignLiveRefreshInput | null | undefined>,
  now = Date.now()
): CampaignLiveRefreshMode {
  let best: CampaignLiveRefreshMode = 'idle'
  for (const campaign of campaigns) {
    const mode = campaignLiveRefreshMode(campaign, now)
    if (mode === 'in_flight') return 'in_flight'
    if (mode === 'receipt_window') best = 'receipt_window'
  }
  return best
}

export function campaignQueryRefetchInterval(
  mode: CampaignLiveRefreshMode
): number | false {
  if (mode === 'in_flight') return CAMPAIGN_IN_FLIGHT_REFETCH_MS
  if (mode === 'receipt_window') return CAMPAIGN_RECEIPT_REFETCH_MS
  return false
}

export function campaignQueryStaleTime(mode: CampaignLiveRefreshMode): number {
  if (mode === 'in_flight' || mode === 'receipt_window') return 0
  return 5 * 60_000
}

export function toCampaignLiveRefreshInput(campaign: {
  status: string
  sentCount?: number | null
  failedCount?: number | null
  deliveredCount?: number | null
  totalRecipients?: number | null
  finalizedAt?: string | Date | null
  updatedAt?: string | Date | null
}): CampaignLiveRefreshInput {
  return {
    status: campaign.status,
    sentCount: asCount(campaign.sentCount),
    failedCount: asCount(campaign.failedCount),
    deliveredCount: asCount(campaign.deliveredCount),
    totalRecipients: asCount(campaign.totalRecipients),
    finalizedAt: campaign.finalizedAt,
    updatedAt: campaign.updatedAt,
  }
}
