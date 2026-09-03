import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import db from '@adonisjs/lucid/services/db'
import OrganizationException from '#exceptions/organization_exception'
import {
  isOrganizationRequiredProfileComplete,
  type OrganizationProfileCompletionSource,
} from '#lib/organization_profile_completion'
import '#types/http'

export const ORGANIZATION_PROFILE_COMPLETION_COLUMNS = [
  'name',
  'email',
  'industry',
  'businessSize',
  'country',
  'address',
] as const

/**
 * Fail-closed: the authenticated tenant's organization must have a complete profile.
 * Uses `request.activeOrganizationId` from tenant middleware — never body/query/client flags.
 */
export function assertOrganizationProfileComplete(
  source: OrganizationProfileCompletionSource | null | undefined
): void {
  if (!source || !isOrganizationRequiredProfileComplete(source)) {
    throw OrganizationException.profileIncomplete()
  }
}

export function organizationProfileSourceFromOrgRow(
  row: Record<string, unknown> | null | undefined
): OrganizationProfileCompletionSource | null {
  if (!row) return null
  return {
    name: (row.orgName as string | null | undefined) ?? (row.name as string | null | undefined),
    email: (row.orgEmail as string | null | undefined) ?? (row.email as string | null | undefined),
    industry: row.industry as string | null | undefined,
    businessSize: row.businessSize as string | null | undefined,
    country: row.country as string | null | undefined,
    address: row.address,
  }
}

/**
 * Organization profile completion guard.
 *
 * Runs after JWT auth + tenant resolution. Opt out on routes needed to
 * complete the profile via `tenant({ skipProfileCompletionGate: true })`.
 */
export default class OrganizationProfileCompletionMiddleware {
  async handle({ request }: HttpContext, next: NextFn) {
    const organizationId = request.activeOrganizationId
    if (!organizationId) {
      throw OrganizationException.profileIncomplete()
    }

    const row = await db
      .from('organizations')
      .where('id', organizationId)
      .whereNull('deletedAt')
      .select(...ORGANIZATION_PROFILE_COMPLETION_COLUMNS)
      .first()

    assertOrganizationProfileComplete(organizationProfileSourceFromOrgRow(row))
    return next()
  }
}
