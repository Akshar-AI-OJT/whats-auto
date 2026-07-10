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
        'group flex flex-col gap-4 rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/30 hover:bg-muted/40',
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold group-hover:text-primary">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground md:text-base">{summary}</p>
    </Link>
  )
}
