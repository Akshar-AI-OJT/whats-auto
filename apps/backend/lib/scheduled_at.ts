import { DateTime } from 'luxon'

/**
 * Campaign scheduledAt parsing.
 *
 * Canonical strategy:
 * - Persist PostgreSQL timestamptz as an absolute instant (UTC).
 * - Timezone-aware ISO (Z or numeric offset) is already an instant — do not convert again.
 * - Naive datetimes are wall-clock times in the organization's IANA timezone and are
 *   converted to UTC exactly once.
 */

const HAS_EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i

const NAIVE_FORMATS = [
  'yyyy-MM-dd HH:mm:ss',
  'yyyy-MM-dd HH:mm',
  "yyyy-MM-dd'T'HH:mm:ss.SSS",
  "yyyy-MM-dd'T'HH:mm:ss",
  "yyyy-MM-dd'T'HH:mm",
  'yyyy-MM-dd',
] as const

export class InvalidScheduledAtError extends Error {
  constructor(message = 'scheduledAt is not a valid datetime') {
    super(message)
    this.name = 'InvalidScheduledAtError'
  }
}

export function resolveIanaTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC'
  const probe = DateTime.now().setZone(timeZone)
  return probe.isValid ? timeZone : 'UTC'
}

/** True when `timeZone` is a real IANA name (not a silent UTC fallback). */
export function isValidIanaTimeZone(timeZone: string | null | undefined): boolean {
  const candidate = timeZone?.trim()
  if (!candidate) return false
  return DateTime.now().setZone(candidate).isValid
}

function requireValid(dt: DateTime): DateTime {
  if (!dt.isValid) {
    throw new InvalidScheduledAtError()
  }
  return dt
}

/**
 * Parse a scheduledAt value into an absolute UTC instant.
 *
 * Date / DateTime inputs are already instants and are not re-zoned.
 * Strings with Z/offset are instants. Naive strings use `timeZone`.
 */
export function parseScheduledAt(
  value: string | Date | DateTime,
  timeZone: string
): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new InvalidScheduledAtError()
    }
    return value
  }

  if (typeof value !== 'string') {
    return requireValid(value).toUTC().toJSDate()
  }

  const raw = value.trim()
  if (!raw) {
    throw new InvalidScheduledAtError()
  }

  const zone = resolveIanaTimeZone(timeZone)

  if (HAS_EXPLICIT_OFFSET.test(raw)) {
    const isoish = raw.includes(' ') ? raw.replace(' ', 'T') : raw
    const parsed = DateTime.fromISO(isoish, { setZone: true })
    if (parsed.isValid) {
      return parsed.toUTC().toJSDate()
    }
    const date = new Date(isoish)
    if (!Number.isNaN(date.getTime())) {
      return date
    }
  }

  if (raw.includes('T')) {
    const iso = DateTime.fromISO(raw, { zone })
    if (iso.isValid) {
      return iso.toUTC().toJSDate()
    }
  }

  for (const format of NAIVE_FORMATS) {
    const parsed = DateTime.fromFormat(raw, format, { zone })
    if (parsed.isValid) {
      return parsed.toUTC().toJSDate()
    }
  }

  throw new InvalidScheduledAtError()
}

export function isScheduledAtInput(value: string): boolean {
  try {
    parseScheduledAt(value, 'UTC')
    return true
  } catch {
    return false
  }
}

export function toUtcIso(value: DateTime | Date | string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new InvalidScheduledAtError()
    }
    return value.toISOString()
  }
  if (typeof value !== 'string') {
    const iso = requireValid(value.toUTC()).toISO()
    if (!iso) {
      throw new InvalidScheduledAtError()
    }
    return iso
  }

  const raw = value.trim()
  if (!raw) {
    throw new InvalidScheduledAtError()
  }

  // Offset/Z (and ISO with T) are absolute instants. Naive `YYYY-MM-DD HH:mm:ss`
  // from pg timestamptz is UTC wall clock — do not parse in the process timezone.
  if (HAS_EXPLICIT_OFFSET.test(raw) || raw.includes('T')) {
    const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw
    const date = new Date(normalized)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }

  return parseScheduledAt(raw, 'UTC').toISOString()
}
