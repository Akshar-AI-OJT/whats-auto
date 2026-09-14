import { DateTime } from 'luxon'

/**
 * Campaign scheduledAt parsing (UTC-only input contract).
 *
 * - Persist PostgreSQL timestamptz as an absolute instant (UTC).
 * - Campaign scheduling accepts only an explicit UTC ISO-8601 instant ending in `Z`.
 * - Naive strings, numeric offsets (including `+00:00`), and `timeZone` are rejected on input.
 * - `toUtcIso` still serializes Date values and Postgres timestamptz text for responses.
 */

/** Strict UTC instant: must end with `Z` (milliseconds optional). */
const UTC_Z_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/i

const HAS_EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i

export class InvalidScheduledAtError extends Error {
  constructor(message = 'scheduledAt is not a valid UTC datetime ending in Z') {
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
 * Parse a campaign scheduledAt into an absolute UTC instant.
 *
 * Strings must be ISO-8601 ending in `Z`. Date / DateTime inputs are already instants.
 */
export function parseUtcScheduledAt(value: string | Date | DateTime): Date {
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
  if (!raw || !UTC_Z_INSTANT.test(raw)) {
    throw new InvalidScheduledAtError()
  }

  const parsed = DateTime.fromISO(raw, { zone: 'utc' })
  if (!parsed.isValid) {
    throw new InvalidScheduledAtError()
  }
  return parsed.toUTC().toJSDate()
}

/** @deprecated Use parseUtcScheduledAt — campaigns are UTC-only. */
export function parseScheduledAt(value: string | Date | DateTime, _timeZone?: string): Date {
  return parseUtcScheduledAt(value)
}

export function isScheduledAtInput(value: string): boolean {
  try {
    parseUtcScheduledAt(value)
    return true
  } catch {
    return false
  }
}

/**
 * Serialize an absolute instant to UTC ISO.
 * Accepts Date/DateTime and common DB timestamptz text (naive UTC wall clock).
 * Do not use for campaign schedule request validation — use parseUtcScheduledAt.
 */
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

  if (UTC_Z_INSTANT.test(raw)) {
    return parseUtcScheduledAt(raw).toISOString()
  }

  // Offset/Z (non-strict) and ISO with T are absolute instants.
  if (HAS_EXPLICIT_OFFSET.test(raw) || raw.includes('T')) {
    const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw
    const date = new Date(normalized)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }

  // Naive `YYYY-MM-DD HH:mm:ss` from pg timestamptz is UTC wall clock.
  const naive = DateTime.fromSQL(raw, { zone: 'utc' })
  if (naive.isValid) {
    return naive.toUTC().toISO()!
  }

  throw new InvalidScheduledAtError()
}
