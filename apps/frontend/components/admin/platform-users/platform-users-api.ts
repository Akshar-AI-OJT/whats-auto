import {
  api,
  type ApiError,
  type ListSuperAdminPlatformUsersParams,
  type PaginationMeta,
  type SuperAdminPlatformUser,
} from '@/lib/api'

function unwrapPaginated(
  data: unknown
): { items: SuperAdminPlatformUser[]; meta: PaginationMeta | null } {
  if (!data) return { items: [], meta: null }
  if (Array.isArray(data)) {
    return { items: data.map(normalizePlatformUser), meta: null }
  }

  const root = data as {
    data?: SuperAdminPlatformUser[] | { data?: SuperAdminPlatformUser[]; meta?: PaginationMeta }
    meta?: PaginationMeta
  }

  if (Array.isArray(root.data)) {
    return { items: root.data.map(normalizePlatformUser), meta: root.meta ?? null }
  }

  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return {
      items: root.data.data.map(normalizePlatformUser),
      meta: root.data.meta ?? root.meta ?? null,
    }
  }

  return { items: [], meta: null }
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
