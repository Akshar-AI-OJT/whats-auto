import Image from 'next/image'
import type { ReactNode } from 'react'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface IntegrationDetailProps {
  name: string
  logo: string
  tagline: string
  ctaLabel: string
  children: ReactNode
}

export function IntegrationDetail({
  name,
  logo,
  tagline,
  ctaLabel,
  children,
}: IntegrationDetailProps) {
  return (
    <article className="mx-auto w-full max-w-screen-xl px-4 py-12 md:py-16">
      <div className="flex flex-col gap-10 md:flex-row md:items-start md:gap-12 lg:gap-16">
        <header className="flex flex-col items-center text-center md:w-80 md:shrink-0 md:items-start md:text-left">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card p-3">
            <Image
              src={logo}
              alt={name}
              width={64}
              height={64}
              className="size-14 object-contain"
            />
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">
            {name}
          </h1>
          <p className="mt-3 text-base text-muted-foreground md:text-lg">
            {tagline}
          </p>
          <Link
            href="/register"
            className={cn(buttonVariants({ size: 'lg' }), 'mt-6 w-full md:w-auto')}
          >
            {ctaLabel}
          </Link>
        </header>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </article>
  )
}
