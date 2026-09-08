import { api, type ContactSummary } from '@/lib/api'
import { unwrapPaginated } from '@/components/dashboard/inbox/inbox-utils'

const LIST_ALL_PAGE_SIZE = 100
const LIST_ALL_MAX_PAGES = 50

/**
 * Walk paginated GET /contacts so pickers and KPIs still see the full org set.
 */
export async function listAllOrganizationContacts(): Promise<ContactSummary[]> {
  const items: ContactSummary[] = []
  let page = 1
  let lastPage = 1
  let guard = 0

  do {
    guard += 1
    const { data } = await api.contacts.list({ page, perPage: LIST_ALL_PAGE_SIZE })
    const result = unwrapPaginated<ContactSummary>(data)
    items.push(...result.items)
    lastPage = result.meta?.lastPage ?? page
    page += 1
  } while (page <= lastPage && guard < LIST_ALL_MAX_PAGES)

  return items
}
