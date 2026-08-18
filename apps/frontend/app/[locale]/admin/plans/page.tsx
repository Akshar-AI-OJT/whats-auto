import { Suspense } from 'react'
import { PlansPage } from '@/components/admin/plans/PlansPage'

export default function AdminPlansRoute() {
  return (
    <Suspense>
      <PlansPage />
    </Suspense>
  )
}
