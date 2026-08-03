/**
 * Message delivery status ordering for Meta receipt updates.
 * Prevents out-of-order webhooks from moving status backwards.
 */

export const MESSAGE_STATUS_RANK = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
} as const

export type RankedMessageStatus = keyof typeof MESSAGE_STATUS_RANK

export function isRankedMessageStatus(status: string): status is RankedMessageStatus {
  return Object.hasOwn(MESSAGE_STATUS_RANK, status)
}

/**
 * Whether an incoming provider status should replace the current one.
 * Uses status rank and optional provider timestamps (newer wins when ranks equal).
 * `failed` applies when its provider timestamp is newer than the current one.
 */
export function shouldApplyProviderStatus(params: {
  currentStatus: string
  incomingStatus: string
  currentProviderStatusAt: Date | null
  incomingProviderStatusAt: Date
}): boolean {
  const { currentStatus, incomingStatus, currentProviderStatusAt, incomingProviderStatusAt } =
    params

  if (!isRankedMessageStatus(incomingStatus)) {
    return false
  }

  if (currentProviderStatusAt && incomingProviderStatusAt < currentProviderStatusAt) {
    return false
  }

  if (incomingStatus === 'failed') {
    return !currentProviderStatusAt || incomingProviderStatusAt >= currentProviderStatusAt
  }

  if (!isRankedMessageStatus(currentStatus)) {
    return true
  }

  const currentRank = MESSAGE_STATUS_RANK[currentStatus]
  const incomingRank = MESSAGE_STATUS_RANK[incomingStatus]

  if (incomingRank < currentRank) {
    return false
  }

  if (incomingRank > currentRank) {
    return true
  }

  // Same rank: apply only when timestamp is strictly newer (or first provider stamp).
  if (!currentProviderStatusAt) {
    return true
  }

  return incomingProviderStatusAt > currentProviderStatusAt
}
