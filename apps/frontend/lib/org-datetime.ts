/**
 * Organization-local datetime helpers for campaign scheduling.
 *
 * Canonical contract (matches backend `#lib/scheduled_at`):
 * - API `scheduledAt` responses are UTC ISO instants (`…Z`).
 * - Display and datetime-local inputs convert that instant in `organizations.timezone`.
 * - Payloads send either a timezone-aware ISO instant or a naive local datetime.
 *   Naive values are converted once on the backend; do not also convert them to UTC here.
 * - Never slice a UTC ISO string (`iso.slice(0, 16)`) for datetime-local — that shows UTC wall clock.
 */

const DATE_TIME_LOCAL = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?/
const HAS_EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  return parts.find((item) => item.type === type)?.value ?? ''
}

/** Convert a datetime-local / naive value into the campaign API payload string. */
export function toCampaignScheduledAtPayload(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (HAS_EXPLICIT_OFFSET.test(trimmed)) return trimmed
  const matched = trimmed.match(DATE_TIME_LOCAL)
  if (!matched) return trimmed
  const seconds = matched[3] ?? '00'
  return `${matched[1]} ${matched[2]}:${seconds}`
}

/** Format a UTC ISO instant in the organization IANA timezone for list/details. */
export function formatCampaignScheduledAt(
  iso: string | null | undefined,
  timeZone: string,
  locale?: string
): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
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
    }).format(date)
  }
}

/** Fill `<input type="datetime-local">` from a UTC ISO instant using org timezone. */
export function isoInstantToDateTimeLocal(
  iso: string | null | undefined,
  timeZone: string
): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
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
