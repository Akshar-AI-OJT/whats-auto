import { PlanViewPage } from '@/components/admin/plans/PlanViewPage'

type AdminPlanDetailRouteProps = {
  params: Promise<{ planId: string }>
}

export default async function AdminPlanDetailRoute({ params }: AdminPlanDetailRouteProps) {
  const { planId } = await params
  return <PlanViewPage planId={planId} />
}
