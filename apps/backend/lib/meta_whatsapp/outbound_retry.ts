import { MetaGraphApiError } from '#lib/meta_whatsapp/graph_client'

/** Max Meta send attempts per outbound_dispatches row (outbound.md). */
export const OUTBOUND_MAX_ATTEMPTS = 5

const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504])

/** Delays after failed attempts 1..4 (minutes). Fifth failure is terminal. */
const RETRY_DELAY_MINUTES = [1, 2, 4, 8, 16] as const

const MAX_RETRY_DELAY_MINUTES = 60

/**
 * Whether an outbound send error should be retried.
 * Network/timeout-like failures and selected HTTP statuses are retryable.
 */
export function isRetryableOutboundError(error: unknown): boolean {
  if (error instanceof MetaGraphApiError) {
    return RETRYABLE_HTTP_STATUSES.has(error.status)
  }

  if (error instanceof TypeError) {
    return true
  }

  if (error && typeof error === 'object') {
    const code = (error as { code?: string }).code
    if (
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNREFUSED' ||
      code === 'ENOTFOUND' ||
      code === 'UND_ERR_CONNECT_TIMEOUT' ||
      code === 'UND_ERR_HEADERS_TIMEOUT' ||
      code === 'UND_ERR_BODY_TIMEOUT'
    ) {
      return true
    }

    const name = (error as { name?: string }).name
    if (name === 'AbortError' || name === 'TimeoutError') {
      return true
    }
  }

  return false
}

/**
 * Minutes to wait after a failed attempt before the next try.
 * `failedAttempt` is the attempts count after the failure (1-based).
 */
export function retryDelayMinutes(failedAttempt: number): number {
  if (failedAttempt < 1) {
    return RETRY_DELAY_MINUTES[0]
  }
  const index = Math.min(failedAttempt - 1, RETRY_DELAY_MINUTES.length - 1)
  return Math.min(RETRY_DELAY_MINUTES[index], MAX_RETRY_DELAY_MINUTES)
}

/**
 * After `attempts` have been consumed, should this failure become terminal?
 */
export function isTerminalOutboundFailure(params: {
  attempts: number
  retryable: boolean
}): boolean {
  if (!params.retryable) {
    return true
  }
  return params.attempts >= OUTBOUND_MAX_ATTEMPTS
}

export function nextAttemptAt(from: Date, failedAttempt: number): Date {
  const delayMs = retryDelayMinutes(failedAttempt) * 60_000
  return new Date(from.getTime() + delayMs)
}
