/**
 * Unwrap Adonis `{ data: T }` envelopes from `api.*` call **bodies**.
 *
 * Callers must pass `response.data` from `{ data, response }` — never the full
 * ApiResult. Passing the full result makes `root.data` the wire envelope and
 * entity field checks fail (e.g. platform settings "not found" on HTTP 200).
 */

export function unwrapEntityData<T extends object>(
  payload: unknown,
  isEntity: (value: Record<string, unknown>) => boolean
): T | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as { data?: unknown }
  const candidate =
    root.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : (payload as Record<string, unknown>)
  if (!isEntity(candidate)) return null
  return candidate as T
}

/** True when `value` looks like the full ApiResult `{ data, response }` from createApi. */
export function isApiResultShape(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const record = value as { data?: unknown; response?: unknown }
  return 'response' in record && typeof record.response === 'object'
}
