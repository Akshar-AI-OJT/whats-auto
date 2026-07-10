import { getTranslations } from 'next-intl/server'
import { FeatureCard } from '@/components/features/FeatureCard'
import { features } from '@/components/features/registry'

export async function FeaturesSection() {
  const t = await getTranslations('landing.features')
  const tFeatures = await getTranslations('features')

  return (
    <section id="features" className="border-b border-border">
      <div className="mx-auto max-w-screen-xl px-4 py-16 md:py-24">
        <div className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
          <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-3 text-base text-muted-foreground md:text-lg">
            {t('subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
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
    </section>
  )
}
