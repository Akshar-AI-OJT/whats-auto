import { SubscriptionDetailsPage } from '@/components/admin/subscriptions/SubscriptionDetailsPage'

type AdminSubscriptionDetailRouteProps = {
  params: Promise<{ subscriptionId: string }>
}

export default async function AdminSubscriptionDetailRoute({
  params,
}: AdminSubscriptionDetailRouteProps) {
  const { subscriptionId } = await params
  return <SubscriptionDetailsPage subscriptionId={subscriptionId} />
}
