import { ArrowRight, Mail } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FeaturesAurora } from '@/components/features/page/FeaturesAurora'
import { FeaturesReveal } from '@/components/features/page/FeaturesReveal'
import {
  featuresOutlineBtn,
  featuresPrimaryBtn,
} from '@/components/features/page/features-styles'

const SALES_MAILTO = 'mailto:sales@whats-auto.com'

export async function PricingHero() {
  const t = await getTranslations('pricingPage')

  return (
    <section className="relative overflow-x-clip">
      <FeaturesAurora />
      <div className="relative z-10 mx-auto max-w-[1200px] px-4 py-14 text-center sm:px-6 sm:py-16 md:py-20 lg:py-24">
        <FeaturesReveal className="mx-auto flex max-w-2xl flex-col items-center">
          <p className="mb-5 inline-flex items-center rounded-full border border-[#E2E8F0] bg-canvas px-3 py-1 text-xs font-semibold text-positive-deep shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:text-sm">
            {t('hero.badge')}
          </p>
          <h1 className="font-display text-[2.2rem] leading-[1.08] tracking-tight text-ink sm:text-5xl sm:leading-[1.05] md:text-[3.1rem]">
            {t('hero.title')}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-body sm:text-lg sm:leading-8">
            {t('hero.subtitle')}
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
            <a
              href={SALES_MAILTO}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                featuresOutlineBtn,
                'group justify-center gap-2'
              )}
            >
              <Mail
                className="size-4 text-mute transition-colors duration-200 group-hover:text-ink"
                aria-hidden
              />
              {t('hero.ctaSecondary')}
            </a>
          </div>
        </FeaturesReveal>
      </div>
    </section>
  )
}
