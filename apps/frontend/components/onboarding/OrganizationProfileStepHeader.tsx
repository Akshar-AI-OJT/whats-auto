export function OrganizationProfileStepHeader({
  title,
  description,
  stepBadge,
}: {
  title: string
  description: string
  stepBadge: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 text-left">
        <h2 className="font-display text-[1.5rem] leading-7 tracking-tight text-ink sm:text-[1.75rem] sm:leading-8">
          {title}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-pretty text-body">{description}</p>
      </div>
      <span className="shrink-0 pt-1 text-xs font-semibold tracking-wide text-primary">
        {stepBadge}
      </span>
    </div>
  )
}
