import { cn } from '@/lib/utils'
import type { PlanStatus } from './types'
import { planStatusTone } from './plan-utils'

export function PlanStatusBadge({
  status,
  label,
  className,
}: {
  status: PlanStatus
  label: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold ring-1',
        planStatusTone(status),
        className
      )}
    >
      {label}
    </span>
  )
}
