import {
  api,
  type ApiError,
  type ListSuperAdminPlatformUsersParams,
  type PaginationMeta,
  type SuperAdminPlatformUser,
} from '@/lib/api'

function normalizePaginationMeta(meta: unknown): PaginationMeta | null {
  if (!meta || typeof meta !== 'object') return null

  const root = meta as Record<string, unknown>
  const total = Number(root.total)
  const perPage = Number(root.perPage)
  const currentPage = Number(root.currentPage)
  const lastPage = Number(root.lastPage)

  if (!Number.isFinite(total) || !Number.isFinite(perPage) || !Number.isFinite(currentPage)) {
    return null
  }

  return {
    total,
    perPage,
    currentPage,
    lastPage: Number.isFinite(lastPage)
      ? lastPage
      : Math.max(1, Math.ceil(total / Math.max(perPage, 1))),
    firstPage: typeof root.firstPage === 'number' ? root.firstPage : 1,
  }
}

function unwrapPaginated(
  data: unknown
): { items: SuperAdminPlatformUser[]; meta: PaginationMeta | null } {
  if (!data) return { items: [], meta: null }
  if (Array.isArray(data)) {
    return { items: data.map(normalizePlatformUser), meta: null }
  }

  const root = data as {
    data?: SuperAdminPlatformUser[] | { data?: SuperAdminPlatformUser[]; meta?: unknown }
    meta?: unknown
    metadata?: unknown
  }

  const rootMeta = normalizePaginationMeta(root.meta ?? root.metadata)

  if (Array.isArray(root.data)) {
    return { items: root.data.map(normalizePlatformUser), meta: rootMeta }
  }

  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return {
      items: root.data.data.map(normalizePlatformUser),
      meta: normalizePaginationMeta(root.data.meta) ?? rootMeta,
    }
  }

  return { items: [], meta: rootMeta }
}

function normalizePlatformUser(user: SuperAdminPlatformUser): SuperAdminPlatformUser {
  return {
    ...user,
    organizations: Array.isArray(user.organizations) ? user.organizations : [],
    status: user.status === 'inactive' || user.isActive === false ? 'inactive' : 'active',
  }
}

export async function listSuperAdminPlatformUsers(
  params: ListSuperAdminPlatformUsersParams = {}
): Promise<{ items: SuperAdminPlatformUser[]; meta: PaginationMeta | null }> {
  const { data } = await api.superAdmin.platformUsers.list(params)
  return unwrapPaginated(data)
}

export function mapPlatformUsersApiError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as ApiError).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}
