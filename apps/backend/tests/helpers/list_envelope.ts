import type { Assert } from '@japa/assert'

export type ListEnvelopeMeta = {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

const PAGINATION_KEYS = ['total', 'perPage', 'currentPage', 'lastPage'] as const

/**
 * Asserts a documented list wire shape: `{ data: T[] }` or `{ data: T[], meta }`.
 * Rejects raw arrays and nested `{ data: { data, meta } }`.
 */
export function assertListEnvelope(
  assert: Assert,
  body: unknown,
  options: { paginated?: boolean } = {}
): void {
  assert.isTrue(
    body !== null && typeof body === 'object' && !Array.isArray(body),
    'list body must be an object, not a raw array'
  )

  const root = body as { data?: unknown; meta?: unknown }
  assert.isTrue(Array.isArray(root.data), 'body.data must be an array')

  if (options.paginated) {
    assert.isTrue(
      root.meta !== null && typeof root.meta === 'object' && !Array.isArray(root.meta),
      'body.meta must be an object'
    )
    const meta = root.meta as Record<string, unknown>
    for (const key of PAGINATION_KEYS) {
      assert.property(meta, key)
    }
  }
}

export function unwrapListEnvelope<T>(body: unknown): {
  items: T[]
  meta: ListEnvelopeMeta | null
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { items: [], meta: null }
  }

  const root = body as { data?: unknown; meta?: ListEnvelopeMeta }
  if (!Array.isArray(root.data)) {
    return { items: [], meta: null }
  }

  return { items: root.data as T[], meta: root.meta ?? null }
}
