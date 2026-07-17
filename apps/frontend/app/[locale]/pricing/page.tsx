import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PricingCard } from '@/components/pricing/PricingCard'
import {
  pricingTierIds,
  type PricingTierData,
} from '@/components/pricing/types'
import { cn } from '@/lib/utils'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pricingPage')

  return {
    title: t('title'),
    description: t('subtitle'),
  }
}

export default async function PricingPage() {
  const t = await getTranslations('pricingPage')

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
    <main className="bg-canvas">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-6 md:py-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h1 className="font-display-black text-3xl text-ink md:text-5xl">
            {t('title')}
          </h1>
          <p className="mt-4 text-base text-body md:text-lg">{t('subtitle')}</p>
        </div>

        <div
          className={cn(
            'flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4',
            'md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:pb-0'
          )}
        >
          {tiers.map((tier) => (
            <PricingCard key={tier.id} tier={tier} />
          ))}
        </div>
      </div>
    </main>
  )
}
