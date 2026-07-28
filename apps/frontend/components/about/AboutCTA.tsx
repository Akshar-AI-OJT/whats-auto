import { ArrowRight, Calendar } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import { FeaturesAurora } from '@/components/features/page/FeaturesAurora'
import {
  featuresOutlineBtn,
  featuresPrimaryBtn,
} from '@/components/features/page/features-styles'
import { FeaturesReveal } from '@/components/features/page/FeaturesReveal'
import { cn } from '@/lib/utils'

export async function AboutCTA() {
  const t = await getTranslations('aboutPage.cta')

  return (
    <section
      id="about-cta"
      className="relative scroll-mt-24 overflow-x-clip py-16 sm:py-20 md:py-24"
    >
      <FeaturesAurora />
      <div className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-6">
        <FeaturesReveal>
          <div
            className={cn(
              'mx-auto flex max-w-3xl flex-col items-center rounded-[32px] border border-[#E2E8F0] bg-canvas/85 px-6 py-12 text-center sm:px-10 sm:py-14',
              'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_24px_60px_rgb(15_23_42/0.08)]',
              'backdrop-blur-sm'
            )}
          >
            <h2 className="font-display max-w-[18ch] text-3xl leading-tight tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
              {t('title')}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-body sm:text-lg sm:leading-8">
              {t('description')}
            </p>
            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
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
                href="/book-demo"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  featuresOutlineBtn,
                  'justify-center gap-2'
                )}
              >
                <Calendar className="size-4" aria-hidden />
                {t('secondary')}
              </Link>
            </div>
          </div>
        </FeaturesReveal>
      </div>
    </section>
  )
}
