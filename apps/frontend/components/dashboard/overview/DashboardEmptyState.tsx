import { cn } from '@/lib/utils'

type DashboardEmptyStateProps = {
  title: string
  description?: string
  icon?: React.ReactNode
  className?: string
}

export function DashboardEmptyState({
  title,
  description,
  icon,
  className,
}: DashboardEmptyStateProps) {
  return (
    <div
      className={cn(
        'mt-5 flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-dash-border bg-dash-surface/40 px-6 py-12 text-center',
        className
      )}
    >
      {icon ? (
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
          {icon}
        </span>
      ) : null}
      <p className="font-medium text-ink">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm leading-6 text-body">{description}</p>
      ) : null}
    </div>
  )
}
