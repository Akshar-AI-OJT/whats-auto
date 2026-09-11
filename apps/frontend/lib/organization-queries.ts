import type { QueryClient } from '@tanstack/react-query'
import { api, type AccessContext, type OrganizationSummary } from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import { ensureAccessTokenForOrganization } from '@/lib/access-token'
import { queryKeys } from '@/lib/query-keys'

function unwrapList(
  data: { data?: OrganizationSummary[] } | OrganizationSummary[] | undefined
): OrganizationSummary[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.data)) return data.data
  return []
}

function unwrapContext(
  data: ({ data?: AccessContext } & AccessContext) | undefined
): AccessContext | null {
  if (!data) return null
  return data.data ?? (data.organizationId ? data : null)
}

/**
 * Access context returns 403 until the session has an active organization,
 * which is a normal state right after signup/login — not an error.
 */
export async function fetchAccessContext(): Promise<AccessContext | null> {
  try {
    const { data } = await api.access.context()
    return unwrapContext(data)
  } catch {
    return null
  }
}

export async function fetchOrganizationList(): Promise<OrganizationSummary[]> {
  const { data } = await api.organizations.list()
  return unwrapList(data)
}

function orgInList(
  organizations: OrganizationSummary[],
  organizationId: string | null | undefined
): string | null {
  if (!organizationId) return null
  return organizations.some((org) => org.id === organizationId) ? organizationId : null
}

/**
 * Warm org/access caches and ensure an active organization + JWT before the
 * dashboard mounts. Fresh email sign-in leaves session.activeOrganizationId
 * null, which otherwise forces a post-shell bootstrap before tenant queries.
 */
export async function prefetchDashboardOrganizationQueries(
  queryClient: QueryClient,
  userId: string | null | undefined,
  options?: { sessionOrganizationId?: string | null }
): Promise<void> {
  if (!userId) return

  const orgs = await queryClient.fetchQuery({
    queryKey: queryKeys.organizations.list(userId),
    queryFn: fetchOrganizationList,
  })

  if (orgs.length === 0) {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.organizations.accessContext(userId),
      queryFn: fetchAccessContext,
    })
    return
  }

  const access = await queryClient.fetchQuery({
    queryKey: queryKeys.organizations.accessContext(userId),
    queryFn: fetchAccessContext,
  })

  const resolvedId =
    orgInList(orgs, options?.sessionOrganizationId) ??
    orgInList(orgs, access?.organizationId ?? null)

  if (resolvedId) {
    await ensureAccessTokenForOrganization(resolvedId)
    return
  }

  const fallbackId = orgs[0]?.id
  if (!fallbackId) return

  await api.organizations.setActive(fallbackId)
  await authClient.getSession({ query: { disableCookieCache: true } })
  await ensureAccessTokenForOrganization(fallbackId)
  await queryClient.fetchQuery({
    queryKey: queryKeys.organizations.accessContext(userId),
    queryFn: fetchAccessContext,
  })
}
