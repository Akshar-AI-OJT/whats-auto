/**
 * Format dates for Vine `vine.date()`.
 * Default Vine accepts `YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss` — not ISO-8601 with `T`/`Z`.
 */

/** Convert `<input type="date">` (YYYY-MM-DD) for Vine `vine.date()`. */
export function dateInputToVineDate(value: string, endOfDay = false): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  const day = trimmed.slice(0, 10)
  return endOfDay ? `${day} 23:59:59` : `${day} 00:00:00`
}

/**
 * Convert `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm` or with seconds)
 * to Vine `vine.date()` format `YYYY-MM-DD HH:mm:ss`.
 */
export function datetimeLocalToVineDate(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed

  const normalized = trimmed.includes('T') ? trimmed.replace('T', ' ') : trimmed
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) {
    return `${normalized}:00`
  }

  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return normalized

  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

/** Prefer YYYY-MM-DD for date inputs. */
export function vineDateToDateInput(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10)
  }
  return date.toISOString().slice(0, 10)
}
