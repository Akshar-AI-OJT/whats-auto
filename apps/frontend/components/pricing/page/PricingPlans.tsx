import { Check } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FeaturesReveal } from '@/components/features/page/FeaturesReveal'
import {
  featuresOutlineBtn,
  featuresPrimaryBtn,
} from '@/components/features/page/features-styles'

const PLAN_KEYS = ['starter', 'growth', 'enterprise'] as const
const SALES_MAILTO = 'mailto:sales@whats-auto.com'

export async function PricingPlans() {
  const t = await getTranslations('pricingPage.plans')

  return (
    <section className="relative bg-canvas py-12 sm:py-16 md:py-20">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {PLAN_KEYS.map((key, i) => {
            const highlighted = key === 'growth'
            const features = t.raw(`${key}.features`) as string[]
            const isSales = key === 'enterprise'

            return (
              <li key={key} className="h-full">
                <FeaturesReveal delayMs={i * 70} className="h-full">
                  <article
                    className={cn(
                      'relative flex h-full flex-col rounded-[28px] border p-6 sm:p-7',
                      'transition-[transform,box-shadow,border-color] duration-[250ms] ease-out',
                      'hover:-translate-y-1',
                      highlighted
                        ? cn(
                            'border-primary/50 bg-gradient-to-b from-primary-pale/80 to-canvas',
                            'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_20px_50px_rgb(159_232_112/0.28),0_0_0_1px_rgb(159_232_112/0.2)]',
                            'hover:border-primary hover:shadow-[0_16px_44px_rgb(159_232_112/0.35),0_0_0_1px_rgb(159_232_112/0.35)]'
                          )
                        : cn(
                            'border-[#E2E8F0] bg-canvas',
                            'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_16px_40px_rgb(15_23_42/0.06)]',
                            'hover:border-primary/50 hover:shadow-[0_16px_40px_rgb(15_23_42/0.1),0_0_0_4px_rgb(159_232_112/0.12)]'
                          )
                    )}
                  >
                    {highlighted ? (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-primary shadow-sm">
                        {t('growth.badge')}
                      </span>
                    ) : null}

                    <h3 className="text-lg font-semibold tracking-tight text-ink">
                      {t(`${key}.name`)}
                    </h3>
                    <div className="mt-4 flex flex-wrap items-baseline gap-1">
                      <span className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
                        {t(`${key}.price`)}
                      </span>
                      {t(`${key}.period`) ? (
                        <span className="text-sm font-medium text-mute">
                          {t(`${key}.period`)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-body">
                      {t(`${key}.description`)}
                    </p>

                    <ul className="mt-6 flex flex-1 flex-col gap-2.5">
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
                          'mt-8 w-full justify-center'
                        )}
                      >
                        {t(`${key}.cta`)}
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
                          'mt-8 w-full justify-center'
                        )}
                      >
                        {t(`${key}.cta`)}
                      </Link>
                    )}
                  </article>
                </FeaturesReveal>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
