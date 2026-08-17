'use client'

import { useTranslations } from 'next-intl'
import { ShieldAlert } from 'lucide-react'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'

type AccessDeniedProps = {
  title?: string
  description?: string
}

/**
 * Shared unauthorized / 403 panel used by route guards and permission-gated pages.
 */
export function AccessDenied({ title, description }: AccessDeniedProps) {
  const t = useTranslations('dashboard.accessDenied')

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      <DashboardPanel as="section" className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-ink">
            <ShieldAlert className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
              {t('eyebrow')}
            </p>
            <h1 className="mt-2 font-display text-[1.5rem] leading-tight tracking-tight text-ink sm:text-2xl">
              {title ?? t('title')}
            </h1>
            <div
              role="alert"
              className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink"
            >
              {description ?? t('description')}
            </div>
          </div>
        </div>
      </DashboardPanel>
    </div>
  )
}
