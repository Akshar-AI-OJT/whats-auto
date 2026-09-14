import type { PaginationMeta } from '@/lib/api'

export type UnwrappedPage<T> = {
  items: T[]
  meta: PaginationMeta | null
}

/** Documented list: `{ data: T[] }`. */
export function unwrapList<T>(payload: unknown): T[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const data = (payload as { data?: unknown }).data
  return Array.isArray(data) ? (data as T[]) : []
}

/** Documented page: `{ data: T[], meta }`. */
export function unwrapPage<T>(payload: unknown): UnwrappedPage<T> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { items: [], meta: null }
  }
  const root = payload as { data?: unknown; meta?: PaginationMeta }
  if (!Array.isArray(root.data)) return { items: [], meta: null }
  return { items: root.data as T[], meta: root.meta ?? null }
}

/** Documented single resource: `{ data: T }`. */
export function unwrapSingle<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const data = (payload as { data?: T }).data
  return data && typeof data === 'object' ? data : null
}
