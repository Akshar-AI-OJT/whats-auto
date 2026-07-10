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
      className="inline-flex items-center gap-0.5 rounded-full border border-border px-1 py-0.5 text-sm"
      role="group"
      aria-label={t('localeSwitcher')}
    >
      {routing.locales.map((loc, index) => (
        <span key={loc} className="inline-flex items-center">
          {index > 0 ? (
            <span aria-hidden className="px-1 text-muted-foreground">
              |
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => switchLocale(loc)}
            className={cn(
              'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 transition-colors',
              locale === loc
                ? 'font-semibold underline underline-offset-4'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-current={locale === loc ? 'true' : undefined}
          >
            {loc.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  )
}
