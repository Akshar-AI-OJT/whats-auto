import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { FeatureCard } from '@/components/features/FeatureCard'
import { features } from '@/components/features/registry'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('featuresPage')

  return {
    title: t('title'),
    description: t('subtitle'),
  }
}

export default async function FeaturesIndexPage() {
  const t = await getTranslations('featuresPage')
  const tFeatures = await getTranslations('features')

  return (
    <main className="bg-canvas">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-6 md:py-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h1 className="font-display-black text-3xl text-ink md:text-5xl">
            {t('title')}
          </h1>
          <p className="mt-4 text-base text-body md:text-lg">{t('subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          {features.map((feature) => (
            <FeatureCard
              key={feature.slug}
              slug={feature.slug}
              icon={feature.icon}
              title={tFeatures(`${feature.slug}.title`)}
              summary={tFeatures(`${feature.slug}.summary`)}
            />
          ))}
        </div>
      </div>
    </main>
  )
}
