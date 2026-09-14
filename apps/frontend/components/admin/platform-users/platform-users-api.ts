import {
  api,
  type ApiError,
  type ListSuperAdminPlatformUsersParams,
  type OrganizationStatusValue,
  type PaginationMeta,
  type SuperAdminPlatformUser,
  type SuperAdminPlatformUserOrganization,
} from '@/lib/api'
import { unwrapPage } from '@/lib/api-unwrap'

export const PLATFORM_ORGANIZATION_STATUSES = [
  'pending_setup',
  'verified_setup',
  'active',
  'suspended',
  'false',
] as const satisfies readonly OrganizationStatusValue[]

/**
 * Preserve exact backend organization status strings.
 * Never use Boolean(status) — Boolean("active") is true and drops the real value.
 */
export function normalizeOrganizationStatus(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  // Legacy payloads that collapsed status with Boolean() cannot be recovered.
  if (typeof value === 'boolean' || value == null) return ''
  return String(value).trim()
}

function normalizePlatformUserOrganization(
  org: SuperAdminPlatformUserOrganization
): SuperAdminPlatformUserOrganization {
  return {
    ...org,
    organizationStatus: normalizeOrganizationStatus(org.organizationStatus),
  }
}

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
  const page = unwrapPage<SuperAdminPlatformUser>(data)
  return {
    items: page.items.map(normalizePlatformUser),
    meta: page.meta ? normalizePaginationMeta(page.meta) ?? page.meta : null,
  }
}

function normalizePlatformUser(user: SuperAdminPlatformUser): SuperAdminPlatformUser {
  const organizations = Array.isArray(user.organizations)
    ? user.organizations.map(normalizePlatformUserOrganization)
    : []

  return {
    ...user,
    organizations,
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
