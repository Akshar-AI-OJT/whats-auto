'use client'

import { CatalogFlowBrowser } from '@/components/catalog/CatalogFlowBrowser'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'

export function FlowCatalogBrowsePage() {
  const { tenantOrganizationId } = useOrganizations()
  return <CatalogFlowBrowser variant="org" organizationId={tenantOrganizationId} />
}
