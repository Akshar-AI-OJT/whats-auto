'use client'

import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { cn } from '@/lib/utils'

export function LocaleSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations('nav')

  function switchLocale(nextLocale: string) {
    if (nextLocale === locale) return
    router.replace(pathname, { locale: nextLocale })
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-xl border border-[#E2E8F0] bg-canvas/80 p-0.5 text-xs shadow-[0_1px_2px_rgb(15_23_42/0.04)]"
      role="group"
      aria-label={t('localeSwitcher')}
    >
      {routing.locales.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => switchLocale(loc)}
          className={cn(
            'inline-flex h-8 min-w-9 items-center justify-center rounded-lg px-2.5 font-semibold tracking-wide transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            locale === loc
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-mute hover:bg-[#F1F5F9] hover:text-ink'
          )}
          aria-current={locale === loc ? 'true' : undefined}
        >
          {loc.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
