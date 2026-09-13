/**
 * Datetime helpers for campaign scheduling.
 *
 * API contract (unchanged): `scheduledAt` is a UTC ISO instant ending in `Z`.
 * UI contract: datetime-local values and displayed timestamps use the
 * organization IANA timezone (browser zone if the org zone is missing/invalid).
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

function wallClockParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hourRaw = part(parts, 'hour')
  return {
    year: Number(part(parts, 'year')),
    month: Number(part(parts, 'month')),
    day: Number(part(parts, 'day')),
    hour: hourRaw === '24' ? 0 : Number(hourRaw),
    minute: Number(part(parts, 'minute')),
    second: Number(part(parts, 'second')),
  }
}

/** Offset of `timeZone` at `date`: zoned wall-clock-as-UTC minus the instant. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const wall = wallClockParts(date, timeZone)
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  return asUtc - date.getTime()
}

function zonedNaiveToUtcDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second)
  const first = utcGuess - tzOffsetMs(new Date(utcGuess), timeZone)
  return new Date(utcGuess - tzOffsetMs(new Date(first), timeZone))
}

function zoneName(
  timeZone: string,
  timeZoneName: NonNullable<Intl.DateTimeFormatOptions['timeZoneName']>
): string | undefined {
  return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName })
    .formatToParts(new Date())
    .find((item) => item.type === 'timeZoneName')?.value
}

/** Short zone label for campaign timestamps (IST, India Time, UTC, …). */
export function formatTimeZoneAbbreviation(timeZone?: string | null): string {
  const zone = resolveDisplayTimeZone(timeZone)
  try {
    const short = zoneName(zone, 'short')
    if (short && !/^GMT/i.test(short)) return short
    return zoneName(zone, 'shortGeneric') || short || zone
  } catch {
    return zone
  }
}

/**
 * Convert a datetime-local / naive value into a UTC ISO payload ending in `Z`.
 * Naive wall-clock values are interpreted in the organization timezone.
 */
export function toCampaignScheduledAtPayload(value: string, timeZone?: string | null): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (HAS_EXPLICIT_OFFSET.test(trimmed)) {
    const ms = Date.parse(trimmed)
    return Number.isNaN(ms) ? trimmed : new Date(ms).toISOString()
  }
  const matched = trimmed.match(DATE_TIME_LOCAL)
  if (!matched) return trimmed
  const [year, month, day] = matched[1].split('-').map(Number)
  const [hour, minute] = matched[2].split(':').map(Number)
  const second = Number(matched[3] ?? '00')
  const utc = zonedNaiveToUtcDate(
    year,
    month,
    day,
    hour,
    minute,
    second,
    resolveDisplayTimeZone(timeZone)
  )
  if (Number.isNaN(utc.getTime())) return trimmed
  return utc.toISOString()
}

/** True when the datetime-local value (org wall clock) is still in the future. */
export function isCampaignScheduleInFuture(value: string, timeZone?: string | null): boolean {
  const payload = toCampaignScheduledAtPayload(value, timeZone)
  const ms = Date.parse(payload)
  return !Number.isNaN(ms) && ms > Date.now()
}

/** Format a datetime-local org wall clock for summaries. */
export function formatDateTimeLocalInput(
  value: string,
  timeZone?: string | null,
  locale?: string
): string {
  const iso = toCampaignScheduledAtPayload(value, timeZone)
  return formatCampaignScheduledAt(iso, timeZone, locale) || value
}

/** Format a UTC ISO instant in the organization timezone. */
export function formatCampaignScheduledAt(
  iso: string | null | undefined,
  timeZone?: string | null,
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
      timeZone: zone,
    }).format(date)
  }
}

/** Fill `<input type="datetime-local">` from a UTC ISO instant using org wall clock. */
export function isoInstantToDateTimeLocal(
  iso: string | null | undefined,
  timeZone?: string | null
): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const zone = resolveDisplayTimeZone(timeZone)
  try {
    const wall = wallClockParts(date, zone)
    const hour = String(wall.hour).padStart(2, '0')
    const minute = String(wall.minute).padStart(2, '0')
    const month = String(wall.month).padStart(2, '0')
    const day = String(wall.day).padStart(2, '0')
    return `${wall.year}-${month}-${day}T${hour}:${minute}`
  } catch {
    return ''
  }
}
