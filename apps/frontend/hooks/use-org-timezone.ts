'use client'

import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { resolveDisplayTimeZone } from '@/lib/org-datetime'

/** Active organization IANA timezone, or the browser zone if unset/invalid. */
export function useOrgTimeZone(): string {
  const { activeOrganization } = useOrganizations()
  return resolveDisplayTimeZone(activeOrganization?.timezone)
}
