import { cn } from '@/lib/utils'
import type { InvoiceStatus } from './types'
import { statusTone } from './invoice-utils'

export function InvoiceStatusBadge({
  status,
  label,
  className,
}: {
  status: InvoiceStatus
  label: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold ring-1',
        statusTone(status),
        className
      )}
    >
      {label}
    </span>
  )
}
