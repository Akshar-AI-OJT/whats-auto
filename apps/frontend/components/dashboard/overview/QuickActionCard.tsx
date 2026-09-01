'use client'

import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

export type QuickActionCardProps = {
  title: string
  description: string
  icon: LucideIcon
  href?: string
  className?: string
  onClick?: () => void
}

const cardClassName = cn(
  'group relative flex h-full w-full cursor-pointer items-start gap-3 overflow-hidden rounded-2xl border border-dash-border bg-dash-surface/70 p-4 text-left',
  'transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out',
  'hover:-translate-y-1 hover:border-primary/45 hover:bg-canvas',
  'hover:dash-elevated-shadow',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-dash-bg'
)

function QuickActionCardContent({
  title,
  description,
  icon: Icon,
}: Pick<QuickActionCardProps, 'title' | 'description' | 'icon'>) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-8 -right-8 size-24 rounded-full bg-primary-pale/60 blur-2xl',
          'opacity-0 transition-opacity duration-300 group-hover:opacity-100'
        )}
      />

      <span
        className={cn(
          'relative flex size-10 shrink-0 items-center justify-center rounded-xl',
          'bg-primary-pale text-positive-deep',
          'shadow-[0_4px_12px_rgb(37_99_235/0.2)]',
          'transition-[transform,background-color,color,box-shadow] duration-200',
          'group-hover:scale-110 group-hover:bg-primary group-hover:text-on-primary',
          'group-hover:shadow-[0_6px_16px_rgb(37_99_235/0.35)]'
        )}
      >
        <Icon className="size-4 transition-transform duration-200 group-hover:scale-105" aria-hidden />
      </span>

      <span className="relative min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="block text-sm font-semibold text-ink transition-colors duration-200 group-hover:text-positive-deep">
            {title}
          </span>
          <ArrowUpRight
            className={cn(
              'size-4 shrink-0 text-mute opacity-0',
              'transition-[transform,opacity,color] duration-200',
              'group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-positive-deep group-hover:opacity-100'
            )}
            aria-hidden
          />
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-mute transition-colors duration-200 group-hover:text-body">
          {description}
        </span>
      </span>
    </>
  )
}

export function QuickActionCard({
  title,
  description,
  icon,
  href,
  className,
  onClick,
}: QuickActionCardProps) {
  if (href) {
    return (
      <Link href={href} className={cn(cardClassName, className)}>
        <QuickActionCardContent title={title} description={description} icon={icon} />
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={cn(cardClassName, className)}>
      <QuickActionCardContent title={title} description={description} icon={icon} />
    </button>
  )
}
