import { cn } from '@/lib/utils'
import type { CustomerGroupStatus } from '@/lib/api'

const STATUS_STYLES: Record<CustomerGroupStatus, string> = {
  active: 'border-positive/25 bg-positive/10 text-positive-deep',
  inactive: 'border-negative/25 bg-negative/10 text-negative',
}

type CustomerGroupStatusBadgeProps = {
  status: CustomerGroupStatus
  label: string
  className?: string
}

export function CustomerGroupStatusBadge({
  status,
  label,
  className,
}: CustomerGroupStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        STATUS_STYLES[status],
        className
      )}
    >
      {label}
    </span>
  )
}

export function CustomerGroupTypeBadge({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-positive/25 bg-positive/10 px-2.5 py-0.5 text-xs font-medium text-positive-deep',
        className
      )}
    >
      {label}
    </span>
  )
}
