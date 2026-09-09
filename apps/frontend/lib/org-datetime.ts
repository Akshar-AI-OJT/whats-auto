/**
 * Datetime helpers for campaign scheduling (UTC-only) and shared zone resolution.
 *
 * Campaign contract:
 * - API `scheduledAt` is a UTC ISO instant ending in `Z`.
 * - datetime-local inputs are treated as UTC wall clock (not browser/org local).
 * - Display always formats in UTC and is labeled `UTC` by callers.
 *
 * `resolveDisplayTimeZone` remains for non-campaign org/browser zone display.
 */

const DATE_TIME_LOCAL = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?/
const HAS_EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((item) => item.type === type)?.value ?? ''
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Valid IANA zone from the org, otherwise the browser zone. */
export function resolveDisplayTimeZone(timeZone?: string | null): string {
  const candidate = timeZone?.trim()
  if (candidate) {
    try {
      Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date())
      return candidate
    } catch {
      // Invalid IANA name — fall through.
    }
  }
  return browserTimeZone()
}

/**
 * Convert a datetime-local / naive value into a UTC ISO payload ending in `Z`.
 * Naive wall-clock values are interpreted as UTC (not org/browser local).
 */
export function toCampaignScheduledAtPayload(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (HAS_EXPLICIT_OFFSET.test(trimmed)) {
    const ms = Date.parse(trimmed)
    return Number.isNaN(ms) ? trimmed : new Date(ms).toISOString()
  }
  const matched = trimmed.match(DATE_TIME_LOCAL)
  if (!matched) return trimmed
  const seconds = matched[3] ?? '00'
  const ms = Date.parse(`${matched[1]}T${matched[2]}:${seconds}.000Z`)
  return Number.isNaN(ms) ? trimmed : new Date(ms).toISOString()
}

/** True when the datetime-local value (UTC wall clock) is still in the future. */
export function isCampaignScheduleInFuture(value: string): boolean {
  const payload = toCampaignScheduledAtPayload(value)
  const ms = Date.parse(payload)
  return !Number.isNaN(ms) && ms > Date.now()
}

/** Format a datetime-local UTC wall clock without converting through browser TZ. */
export function formatDateTimeLocalInput(value: string, locale?: string): string {
  const matched = value.trim().match(DATE_TIME_LOCAL)
  if (!matched) return value
  const utc = new Date(`${matched[1]}T${matched[2]}:${matched[3] ?? '00'}Z`)
  if (Number.isNaN(utc.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(utc)
}

/** Format a UTC ISO instant in UTC for campaign list/details. */
export function formatCampaignScheduledAt(
  iso: string | null | undefined,
  _timeZone?: string | null,
  locale?: string
): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(date)
  }
}

/** Fill `<input type="datetime-local">` from a UTC ISO instant using UTC wall clock. */
export function isoInstantToDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
    const hour = part(parts, 'hour') === '24' ? '00' : part(parts, 'hour')
    return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}T${hour}:${part(parts, 'minute')}`
  } catch {
    return ''
  }
}
