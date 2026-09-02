'use client'

import { Headset } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { authOutlineButtonClassName } from '@/components/auth/auth-field-styles'
import { cn } from '@/lib/utils'

/**
 * Top bar for organization profile completion.
 * Preserves the existing Whats-Auto wordmark and landing/home link.
 */
export function OrganizationProfileHeader() {
  const t = useTranslations('onboarding.organizationProfile')

  return (
    <header className="sticky top-0 z-20 border-b border-[#E2E8F0] bg-canvas">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between px-4 sm:px-5 lg:px-8">
        <Link
          href="/"
          className="w-fit cursor-pointer font-display text-xl leading-none text-ink transition-opacity hover:opacity-80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8FAFC] sm:text-[1.35rem]"
        >
          Whats-Auto
        </Link>
        <div className="flex items-center gap-2.5 sm:gap-3">
          <span className="hidden text-sm text-mute sm:inline">{t('help.needHelp')}</span>
          <Link
            href="/contact"
            className={cn(
              authOutlineButtonClassName,
              'inline-flex h-9 w-auto items-center gap-2 px-3 text-sm font-semibold text-ink'
            )}
          >
            <Headset className="size-4" aria-hidden />
            {t('help.contactSupport')}
          </Link>
        </div>
      </div>
    </header>
  )
}

export function OrganizationProfileLayout({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="light-locked auth-palette min-h-svh overflow-x-clip overflow-y-visible bg-[#F8FAFC]">
      <OrganizationProfileHeader />
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-5 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-6 lg:gap-7">
          <div className="w-full shrink-0 md:sticky md:top-[5.5rem] md:w-[15.5rem] lg:w-[17rem] xl:w-[18.5rem]">
            {sidebar}
          </div>
          <div className="min-w-0 w-full flex-1">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function OrganizationProfileFormCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-[#E2E8F0] bg-canvas',
        'p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_rgb(15_23_42/0.06)]',
        'sm:p-7 lg:px-8 lg:py-8',
        className
      )}
    >
      {children}
    </section>
  )
}
