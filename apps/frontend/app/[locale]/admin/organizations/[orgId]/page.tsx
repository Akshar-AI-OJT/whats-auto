import { OrganizationDetailsPage } from '@/components/admin/organizations/OrganizationDetailsPage'

type PageProps = {
  params: Promise<{ orgId: string }>
}

export default async function AdminOrganizationDetailRoute({ params }: PageProps) {
  const { orgId } = await params
  return <OrganizationDetailsPage orgId={orgId} />
}
