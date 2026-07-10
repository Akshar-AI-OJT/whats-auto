import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { PricingCard } from '@/components/pricing/PricingCard'
import {
  pricingTierIds,
  type PricingTierData,
} from '@/components/pricing/types'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export async function PricingSection() {
  const t = await getTranslations('landing.pricing')

  const tiers: PricingTierData[] = pricingTierIds.map((id) => ({
    id,
    name: t(`${id}.name`),
    price: t(`${id}.price`),
    period: t(`${id}.period`),
    description: t(`${id}.description`),
    cta: t(`${id}.cta`),
    highlighted: id === 'growth',
  }))

  return (
    <section id="pricing" className="border-b border-border">
      <div className="mx-auto max-w-screen-xl px-4 py-16 md:py-24">
        <div className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
          <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-3 text-base text-muted-foreground md:text-lg">
            {t('subtitle')}
          </p>
        </div>

        <div
          className={cn(
            'flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4',
            'md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:pb-0',
          )}
        >
          {tiers.map((tier) => (
            <PricingCard key={tier.id} tier={tier} />
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link href="/pricing" className={buttonVariants({ variant: 'link' })}>
            {t('viewAll')}
          </Link>
        </div>
      </div>
    </section>
  )
}
