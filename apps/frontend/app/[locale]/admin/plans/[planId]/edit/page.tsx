import { PlanFormPage } from '@/components/admin/plans/PlanFormPage'

type AdminEditPlanRouteProps = {
  params: Promise<{ planId: string }>
}

export default async function AdminEditPlanRoute({ params }: AdminEditPlanRouteProps) {
  const { planId } = await params
  return <PlanFormPage mode="edit" planId={planId} />
}
