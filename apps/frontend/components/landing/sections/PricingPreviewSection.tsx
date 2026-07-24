import { ArrowRight, Check } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  featuresOutlineBtn,
  featuresPrimaryBtn,
} from '@/components/features/page/features-styles'

const PLAN_KEYS = ['starter', 'growth', 'enterprise'] as const
const SALES_MAILTO = 'mailto:sales@whats-auto.com'

export async function PricingPreviewSection() {
  const t = await getTranslations('landing.pricingPreview')

  return (
    <section
      id="pricing"
      className="relative scroll-mt-24 overflow-x-clip bg-[#F8FAFC] py-16 sm:py-20 md:py-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-1/4 size-[20rem] rounded-full bg-primary/10 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-[8%] size-[16rem] rounded-full bg-primary-pale/60 blur-[100px]"
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
          <p className="mb-4 inline-flex items-center rounded-full border border-[#E2E8F0] bg-canvas px-3 py-1 text-xs font-semibold text-positive-deep shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:text-sm">
            {t('badge')}
          </p>
          <h2 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
            {t('title')}
          </h2>
          <p className="mt-4 text-base leading-7 text-body sm:text-lg sm:leading-8">
            {t('subtitle')}
          </p>
        </div>

        <ul className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:items-center lg:gap-6">
          {PLAN_KEYS.map((key) => {
            const highlighted = key === 'growth'
            const features = t.raw(`plans.${key}.features`) as string[]
            const isSales = key === 'enterprise'

            return (
              <li
                key={key}
                className={cn('h-full', highlighted && 'lg:z-10 lg:scale-[1.04]')}
              >
                <article
                  className={cn(
                    'relative flex h-full flex-col rounded-[28px] border bg-canvas p-6',
                    'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_16px_40px_rgb(15_23_42/0.06)]',
                    'transition-[transform,box-shadow,border-color] duration-200 ease-out',
                    'hover:-translate-y-1',
                    highlighted
                      ? cn(
                          'border-primary/55',
                          'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_20px_50px_rgb(159_232_112/0.3),0_0_0_1px_rgb(159_232_112/0.25)]',
                          'hover:border-primary hover:shadow-[0_16px_44px_rgb(159_232_112/0.38)]'
                        )
                      : cn(
                          'border-[#E2E8F0]',
                          'hover:border-primary/45 hover:shadow-[0_16px_40px_rgb(15_23_42/0.1),0_0_0_4px_rgb(159_232_112/0.12)]'
                        )
                  )}
                >
                  {highlighted ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-primary shadow-sm">
                      {t('plans.growth.badge')}
                    </span>
                  ) : null}

                  <h3 className="text-lg font-semibold tracking-tight text-ink">
                    {t(`plans.${key}.name`)}
                  </h3>
                  <p className="mt-3 font-display text-3xl tracking-tight text-ink">
                    {t(`plans.${key}.price`)}
                  </p>

                  <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                    {features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm leading-5 text-ink"
                      >
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-positive-deep">
                          <Check className="size-3 stroke-[2.5]" aria-hidden />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {isSales ? (
                    <a
                      href={SALES_MAILTO}
                      className={cn(
                        buttonVariants({ size: 'lg', variant: 'outline' }),
                        featuresOutlineBtn,
                        'mt-6 w-full justify-center'
                      )}
                    >
                      {t(`plans.${key}.cta`)}
                    </a>
                  ) : (
                    <Link
                      href="/register"
                      className={cn(
                        buttonVariants({
                          size: 'lg',
                          variant: highlighted ? 'default' : 'outline',
                        }),
                        highlighted ? featuresPrimaryBtn : featuresOutlineBtn,
                        'mt-6 w-full justify-center'
                      )}
                    >
                      {t(`plans.${key}.cta`)}
                    </Link>
                  )}
                </article>
              </li>
            )
          })}
        </ul>

        <div className="mt-10 flex flex-col items-center gap-3 text-center md:mt-12">
          <p className="text-sm font-medium text-body sm:text-base">
            {t('footerPrompt')}
          </p>
          <Link
            href="/pricing"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              featuresOutlineBtn,
              'group justify-center gap-2'
            )}
          >
            {t('footerCta')}
            <ArrowRight
              className="size-4 text-mute transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink"
              aria-hidden
            />
          </Link>
        </div>
      </div>
    </section>
  )
}
