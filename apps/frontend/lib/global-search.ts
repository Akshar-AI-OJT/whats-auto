import type { GlobalSearchResponse, GlobalSearchResult, GlobalSearchResultType } from '@/lib/api'

export const GLOBAL_SEARCH_DEBOUNCE_MS = 300

const RESULT_TYPE_SET = new Set<string>([
  'contact',
  'conversation',
  'campaign',
  'template',
  'flow',
  'customer_group',
  'organization',
  'user',
  'plan',
  'subscription',
  'invoice',
])

export function unwrapGlobalSearch(
  data: { data?: GlobalSearchResponse } | GlobalSearchResponse | undefined
): GlobalSearchResponse {
  if (!data || typeof data !== 'object') {
    return { query: '', results: [] }
  }

  const nested = 'data' in data ? data.data : undefined
  if (nested && Array.isArray(nested.results)) {
    return { query: nested.query ?? '', results: nested.results }
  }

  if ('results' in data && Array.isArray(data.results)) {
    return { query: data.query ?? '', results: data.results }
  }

  return { query: '', results: [] }
}

export function hrefForSearchResult(
  scope: 'organization' | 'platform',
  result: GlobalSearchResult
): string | null {
  if (scope === 'organization') {
    switch (result.type) {
      case 'contact':
        return '/dashboard/contacts'
      case 'conversation':
        return `/dashboard/inbox/${result.id}`
      case 'campaign':
        return `/dashboard/campaigns/${result.id}`
      case 'template':
        return `/dashboard/templates/${result.id}`
      case 'flow':
        return `/dashboard/flows/${result.id}`
      case 'customer_group':
        return `/dashboard/customer-groups/${result.id}`
      default:
        return null
    }
  }

  switch (result.type) {
    case 'organization':
      return `/admin/organizations/${result.id}`
    case 'user':
      return '/admin/platform-users'
    case 'plan':
      return `/admin/plans/${result.id}`
    case 'subscription':
      return '/admin/subscriptions'
    case 'invoice':
      return `/admin/invoices/${result.id}`
    default:
      return null
  }
}

const TYPE_ORDER: GlobalSearchResultType[] = [
  'contact',
  'conversation',
  'campaign',
  'template',
  'flow',
  'customer_group',
  'organization',
  'user',
  'plan',
  'subscription',
  'invoice',
]

export function groupSearchResults(
  results: GlobalSearchResult[]
): Array<{ type: GlobalSearchResultType; items: GlobalSearchResult[] }> {
  const buckets = new Map<GlobalSearchResultType, GlobalSearchResult[]>()
  for (const result of results) {
    if (!RESULT_TYPE_SET.has(result.type)) continue
    const type = result.type
    const list = buckets.get(type) ?? []
    list.push(result)
    buckets.set(type, list)
  }

  return TYPE_ORDER.flatMap((type) => {
    const items = buckets.get(type)
    return items && items.length > 0 ? [{ type, items }] : []
  })
}
