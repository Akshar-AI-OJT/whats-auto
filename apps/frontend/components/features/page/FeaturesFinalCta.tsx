import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FeaturesAurora } from './FeaturesAurora'
import {
  featuresOutlineBtn,
  featuresPrimaryBtn,
} from './features-styles'
import { FeaturesReveal } from './FeaturesReveal'

export async function FeaturesFinalCta() {
  const t = await getTranslations('featuresPage.cta')

  return (
    <section className="relative overflow-x-clip py-16 sm:py-20 md:py-24">
      <FeaturesAurora />
      <div className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-6">
        <FeaturesReveal>
          <div
            className={cn(
              'mx-auto flex max-w-3xl flex-col items-center rounded-[32px] border border-[#E2E8F0] bg-canvas/80 px-6 py-12 text-center sm:px-10 sm:py-14',
              'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_24px_60px_rgb(15_23_42/0.08)]',
              'backdrop-blur-sm'
            )}
          >
            <h2 className="font-display max-w-[18ch] text-3xl leading-tight tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
              {t('title')}
            </h2>
            <p className="mt-4 max-w-md text-base leading-7 text-body sm:text-lg">
              {t('description')}
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
                {t('primary')}
                <ArrowRight
                  className="ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
              <Link
                href="/#contact"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  featuresOutlineBtn,
                  'group justify-center gap-2'
                )}
              >
                {t('secondary')}
                <ArrowRight
                  className="size-4 text-mute transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink"
                  aria-hidden
                />
              </Link>
            </div>
          </div>
        </FeaturesReveal>
      </div>
    </section>
  )
}
