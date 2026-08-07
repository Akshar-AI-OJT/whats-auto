import { cn } from '@/lib/utils'
import { statusTone } from './template-utils'

export function TemplateStatusBadge({
  status,
  label,
  className,
}: {
  status: string
  label: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        statusTone(status),
        className
      )}
    >
      {label}
    </span>
  )
}
