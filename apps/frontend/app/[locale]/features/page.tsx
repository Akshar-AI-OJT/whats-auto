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
    <main className="mx-auto max-w-screen-xl px-4 py-16 md:py-24">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-4 text-base text-muted-foreground md:text-lg">
          {t('subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
    </main>
  )
}
