import { Link } from '@/i18n/navigation'
import { getFeatureIcon } from '@/components/features/icons'
import { cn } from '@/lib/utils'

interface FeatureCardProps {
  slug: string
  icon: string
  title: string
  summary: string
}

export function FeatureCard({ slug, icon, title, summary }: FeatureCardProps) {
  const Icon = getFeatureIcon(icon)

  return (
    <Link
      href={`/features/${slug}`}
      className={cn(
        'group flex flex-col gap-4 rounded-xl bg-canvas-soft p-6 transition-colors hover:bg-primary-pale'
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-lg bg-canvas text-ink">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold text-ink group-hover:text-ink-deep">
        {title}
      </h3>
      <p className="text-sm text-body md:text-base">{summary}</p>
    </Link>
  )
}
