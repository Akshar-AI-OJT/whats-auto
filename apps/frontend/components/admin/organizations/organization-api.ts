import {
  api,
  type ApiError,
  type PaginationMeta,
  type SuperAdminOrganization,
  type UpdateSuperAdminOrganizationBody,
} from '@/lib/api'

/** Platform UI statuses derived from API `status` + `deletedAt`. */
export type AdminOrganizationUiStatus = 'active' | 'suspended' | 'pending' | 'archived'

export type AdminOrganizationListItem = SuperAdminOrganization & {
  uiStatus: AdminOrganizationUiStatus
}

function unwrapPaginated(
  data: unknown
): { items: SuperAdminOrganization[]; meta: PaginationMeta | null } {
  if (!data) return { items: [], meta: null }
  if (Array.isArray(data)) return { items: data, meta: null }

  const root = data as {
    data?: SuperAdminOrganization[] | { data?: SuperAdminOrganization[]; meta?: PaginationMeta }
    meta?: PaginationMeta
  }

  if (Array.isArray(root.data)) {
    return { items: root.data, meta: root.meta ?? null }
  }

  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return { items: root.data.data, meta: root.data.meta ?? root.meta ?? null }
  }

  return { items: [], meta: null }
}

export function mapOrganizationUiStatus(org: SuperAdminOrganization): AdminOrganizationUiStatus {
  if (org.deletedAt || org.status === 'false') return 'archived'
  if (org.status === 'pending_setup') return 'pending'
  if (org.status === 'suspended') return 'suspended'
  return 'active'
}

export function toAdminOrganizationListItem(
  org: SuperAdminOrganization
): AdminOrganizationListItem {
  return {
    ...org,
    uiStatus: mapOrganizationUiStatus(org),
  }
}

export async function listSuperAdminOrganizations(params: {
  page?: number
  perPage?: number
}): Promise<{ items: AdminOrganizationListItem[]; meta: PaginationMeta | null }> {
  const { data } = await api.superAdmin.organizations.list(params)
  const { items, meta } = unwrapPaginated(data)
  return {
    items: items.map(toAdminOrganizationListItem),
    meta,
  }
}

/** Walks existing paginated list API so Super Admin KPIs/filters see the platform set. */
export async function listAllSuperAdminOrganizations(): Promise<AdminOrganizationListItem[]> {
  const perPage = 100
  let page = 1
  let lastPage = 1
  const all: AdminOrganizationListItem[] = []

  do {
    const { items, meta } = await listSuperAdminOrganizations({ page, perPage })
    all.push(...items)
    lastPage = meta?.lastPage ?? page
    page += 1
  } while (page <= lastPage && page <= 20)

  return all
}

export async function updateSuperAdminOrganization(
  organizationId: string,
  body: UpdateSuperAdminOrganizationBody
): Promise<AdminOrganizationListItem> {
  const { data } = await api.superAdmin.organizations.update(organizationId, body)
  const org =
    data && typeof data === 'object' && 'data' in data && data.data
      ? data.data
      : (data as SuperAdminOrganization)
  return toAdminOrganizationListItem(org)
}

export async function deleteSuperAdminOrganization(organizationId: string): Promise<void> {
  await api.superAdmin.organizations.destroy(organizationId)
}

/**
 * No get-by-id endpoint — locate the org in a single page fetch (demo-scale).
 * Walks a few pages if needed.
 */
export async function findSuperAdminOrganization(
  organizationId: string
): Promise<AdminOrganizationListItem | null> {
  const perPage = 100
  let page = 1
  let lastPage = 1

  do {
    const { items, meta } = await listSuperAdminOrganizations({ page, perPage })
    const found = items.find((org) => org.id === organizationId)
    if (found) return found
    lastPage = meta?.lastPage ?? page
    page += 1
  } while (page <= lastPage && page <= 10)

  return null
}

export function mapOrgApiError(error: unknown, fallback: string): string {
  const apiError = error as ApiError
  if (apiError.status === 401) return 'Your session expired. Please sign in again.'
  if (apiError.status === 403) return 'You do not have permission for this action.'
  if (apiError.code === 'E_ORGANIZATION_NOT_FOUND') return 'Organization not found.'
  return apiError.message || fallback
}
