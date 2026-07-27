'use client'

import { useTranslations } from 'next-intl'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { DashboardPanel } from '../ui/DashboardPanel'

export function WelcomeSection({ className }: { className?: string }) {
  const t = useTranslations('dashboard.home')
  const { user } = useAuth()

  const firstName =
    user?.firstname?.trim() ||
    user?.name?.trim()?.split(/\s+/)[0] ||
    null

  return (
    <DashboardPanel
      as="section"
      className={cn(
        'relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7',
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-primary-pale/80 blur-[70px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 left-10 size-40 rounded-full bg-canvas-soft/80 blur-[60px]"
      />

      <div className="relative">
        <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
          {t('eyebrow')}
        </p>
        <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl md:text-4xl">
          {firstName ? t('welcomeNamed', { name: firstName }) : t('welcome')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-body sm:text-base sm:leading-7">
          {t('subtitle')}
        </p>
      </div>
    </DashboardPanel>
  )
}
