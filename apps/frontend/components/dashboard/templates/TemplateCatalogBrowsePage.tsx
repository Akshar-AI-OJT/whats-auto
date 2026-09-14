'use client'

import { CatalogTemplateBrowser } from '@/components/catalog/CatalogTemplateBrowser'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'

export function TemplateCatalogBrowsePage() {
  const { tenantOrganizationId } = useOrganizations()
  return <CatalogTemplateBrowser variant="org" organizationId={tenantOrganizationId} />
}
