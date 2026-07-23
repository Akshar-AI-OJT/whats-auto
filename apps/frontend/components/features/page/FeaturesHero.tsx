import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FeaturesAurora } from './FeaturesAurora'
import { FeaturesExploreButton } from './FeaturesExploreButton'
import { featuresPrimaryBtn } from './features-styles'
import { FeaturesHeroMockup } from './FeaturesHeroMockup'
import { FeaturesReveal } from './FeaturesReveal'

export async function FeaturesHero() {
  const t = await getTranslations('featuresPage')

  return (
    <section className="relative overflow-x-clip">
      <FeaturesAurora />
      <div className="relative z-10 mx-auto grid max-w-[1200px] gap-12 px-4 py-14 sm:px-6 sm:py-16 md:gap-14 md:py-20 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
        <FeaturesReveal className="flex min-w-0 flex-col items-start text-left">
          <p className="mb-5 inline-flex items-center rounded-full border border-[#E2E8F0] bg-canvas px-3 py-1 text-xs font-semibold text-positive-deep shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:text-sm">
            {t('hero.badge')}
          </p>
          <h1 className="max-w-[18ch] font-display text-[2.2rem] leading-[1.08] tracking-tight text-ink sm:text-5xl sm:leading-[1.05] md:text-[3.1rem]">
            {t('hero.title')}
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-body sm:text-lg sm:leading-8">
            {t('hero.description')}
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Link
              href="/register"
              className={cn(
                buttonVariants({ size: 'lg' }),
                featuresPrimaryBtn,
                'group justify-center'
              )}
            >
              {t('hero.ctaPrimary')}
              <ArrowRight
                className="ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            <FeaturesExploreButton label={t('hero.ctaSecondary')} />
          </div>
        </FeaturesReveal>

        <FeaturesReveal delayMs={120} className="min-w-0 lg:justify-self-end">
          <FeaturesHeroMockup
            label={t('hero.visualLabel')}
            copy={{
              workspaceTitle: t('hero.mock.workspaceTitle'),
              inboxLabel: t('hero.mock.inboxLabel'),
              online: t('hero.mock.online'),
              threadName: t('hero.mock.threadName'),
              customerMsg: t('hero.mock.customerMsg'),
              aiMsg: t('hero.mock.aiMsg'),
              aiBadge: t('hero.mock.aiBadge'),
              chips: {
                ai: t('hero.mock.chips.ai'),
                broadcast: t('hero.mock.chips.broadcast'),
                inbox: t('hero.mock.chips.inbox'),
                analytics: t('hero.mock.chips.analytics'),
                auth: t('hero.mock.chips.auth'),
                tenant: t('hero.mock.chips.tenant'),
              },
            }}
          />
        </FeaturesReveal>
      </div>
    </section>
  )
}
