import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

export function OrganizationProfileReviewCard({
  title,
  editLabel,
  onEdit,
  children,
}: {
  title: string
  editLabel: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-canvas p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <Pencil className="size-3.5" aria-hidden />
          {editLabel}
        </button>
      </div>
      {children}
    </div>
  )
}

export function OrganizationProfileReviewItem({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-mute">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-ink">{value}</dd>
    </div>
  )
}

export function OrganizationProfileReviewGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <dl className={cn('grid min-w-0 gap-x-6 gap-y-3 text-sm sm:grid-cols-2', className)}>
      {children}
    </dl>
  )
}
