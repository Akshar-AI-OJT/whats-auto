import {
  Megaphone,
  ChartColumn,
  Bot,
  Store,
  CreditCard,
  ClipboardList,
  AppWindow,
  MousePointerClick,
  type LucideIcon,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const FEATURE_KEYS = [
  'broadcasting',
  'adsManager',
  'chatbots',
  'catalog',
  'payments',
  'forms',
  'webviews',
  'clickTracking',
] as const

const FEATURE_ICONS: Record<(typeof FEATURE_KEYS)[number], LucideIcon> = {
  broadcasting: Megaphone,
  adsManager: ChartColumn,
  chatbots: Bot,
  catalog: Store,
  payments: CreditCard,
  forms: ClipboardList,
  webviews: AppWindow,
  clickTracking: MousePointerClick,
}

const CARD_SURFACES = [
  'bg-canvas-soft',
  'bg-primary-pale',
  'bg-canvas-soft',
  'bg-primary-pale',
  'bg-primary-pale',
  'bg-canvas-soft',
  'bg-primary-pale',
  'bg-canvas-soft',
] as const

export async function FeaturesSection() {
  const t = await getTranslations('landing.features')

  return (
    <section id="features" className="scroll-mt-24 bg-canvas">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-6 md:py-24">
        <div className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
          <h2 className="font-display-black text-3xl text-ink md:text-5xl">{t('title')}</h2>
          <p className="mt-4 text-base text-body md:text-lg">{t('subtitle')}</p>
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {FEATURE_KEYS.map((key, i) => {
            const Icon = FEATURE_ICONS[key]
            const surface = CARD_SURFACES[i % CARD_SURFACES.length]
            const isDark = surface.includes('bg-ink')

            return (
              <li
                key={key}
                className={cn(
                  'flex flex-col gap-3 rounded-xl p-5 md:p-6',
                  surface,
                  isDark ? 'text-primary' : 'text-ink'
                )}
              >
                <div
                  className={cn(
                    'flex size-10 items-center justify-center rounded-lg',
                    isDark ? 'bg-primary/15 text-primary' : 'bg-canvas text-ink'
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3
                  className={cn(
                    'text-sm font-semibold md:text-base',
                    isDark ? 'text-primary' : 'text-ink'
                  )}
                >
                  {t(`items.${key}.title`)}
                </h3>
                <p
                  className={cn(
                    'text-xs leading-5 md:text-sm md:leading-6',
                    isDark ? 'text-primary/80' : 'text-body'
                  )}
                >
                  {t(`items.${key}.description`)}
                </p>
              </li>
            )
          })}
        </ul>

        <div className="mt-10 text-center">
          <Link href="/features" className={buttonVariants({ variant: 'link' })}>
            {t('viewAll')}
          </Link>
        </div>
      </div>
    </section>
  )
}
