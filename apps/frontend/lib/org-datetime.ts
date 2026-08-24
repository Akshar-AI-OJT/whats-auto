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
const HAS_EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
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

function zonedWallClockToUtcMs(isoLocal: string, timeZone: string): number {
  const matched = isoLocal.trim().match(DATE_TIME_LOCAL)
  if (!matched) {
    const parsed = Date.parse(isoLocal)
    return Number.isNaN(parsed) ? Number.NaN : parsed
  }

  const asUtc = Date.UTC(
    Number(matched[1].slice(0, 4)),
    Number(matched[1].slice(5, 7)) - 1,
    Number(matched[1].slice(8, 10)),
    Number(matched[2].slice(0, 2)),
    Number(matched[2].slice(3, 5)),
    Number(matched[3] ?? '00')
  )

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  const wallAsUtc = (ms: number) => {
    const parts = dtf.formatToParts(new Date(ms))
    const wallHour = part(parts, 'hour') === '24' ? 0 : Number(part(parts, 'hour'))
    return Date.UTC(
      Number(part(parts, 'year')),
      Number(part(parts, 'month')) - 1,
      Number(part(parts, 'day')),
      wallHour,
      Number(part(parts, 'minute')),
      Number(part(parts, 'second'))
    )
  }

  let utc = asUtc
  utc += asUtc - wallAsUtc(utc)
  utc += asUtc - wallAsUtc(utc)
  return utc
}

/** Convert a datetime-local / naive value into the campaign API payload string. */
export function toCampaignScheduledAtPayload(value: string, timeZone?: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (HAS_EXPLICIT_OFFSET.test(trimmed)) return trimmed
  if (timeZone) {
    const ms = zonedWallClockToUtcMs(trimmed, resolveDisplayTimeZone(timeZone))
    if (!Number.isNaN(ms)) return new Date(ms).toISOString()
  }
  const matched = trimmed.match(DATE_TIME_LOCAL)
  if (!matched) return trimmed
  const seconds = matched[3] ?? '00'
  return `${matched[1]} ${matched[2]}:${seconds}`
}

/** True when the datetime-local wall clock is still in the future in `timeZone`. */
export function isCampaignScheduleInFuture(value: string, timeZone: string): boolean {
  const ms = zonedWallClockToUtcMs(value, resolveDisplayTimeZone(timeZone))
  return !Number.isNaN(ms) && ms > Date.now()
}

/** Format a datetime-local wall clock without converting it through UTC/browser TZ. */
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

/** Format a UTC ISO instant in the organization IANA timezone for list/details. */
export function formatCampaignScheduledAt(
  iso: string | null | undefined,
  timeZone: string,
  locale?: string
): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const zone = resolveDisplayTimeZone(timeZone)
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: zone,
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
      timeZone: resolveDisplayTimeZone(timeZone),
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
