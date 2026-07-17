import type { ReactNode } from 'react'
import { Link } from '@/i18n/navigation'
import { getFeatureIcon } from '@/components/features/icons'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FeatureDetailProps {
  icon: string
  title: string
  summary: string
  ctaLabel: string
  children: ReactNode
}

export function FeatureDetail({
  icon,
  title,
  summary,
  ctaLabel,
  children,
}: FeatureDetailProps) {
  const Icon = getFeatureIcon(icon)

  return (
    <article className="bg-canvas">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-6 md:py-16">
        <div className="lg:grid lg:grid-cols-[minmax(0,280px)_1fr] lg:gap-12 xl:gap-16">
          <aside className="mb-10 rounded-xl bg-canvas-soft p-6 lg:sticky lg:top-24 lg:mb-0 lg:self-start">
            <div className="flex size-14 items-center justify-center rounded-xl bg-primary text-on-primary">
              <Icon className="size-7" aria-hidden />
            </div>
            <h1 className="font-display mt-4 text-3xl text-ink md:text-4xl">
              {title}
            </h1>
            <p className="mt-3 text-base text-body md:text-lg">{summary}</p>
            <Link
              href="/register"
              className={cn(buttonVariants({ size: 'lg' }), 'mt-6 w-full sm:w-auto')}
            >
              {ctaLabel}
            </Link>
          </aside>

          <div className="min-w-0 space-y-6 text-body [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
            {children}
          </div>
        </div>
      </div>
    </article>
  )
}
