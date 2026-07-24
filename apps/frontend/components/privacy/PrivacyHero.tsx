import { getTranslations } from 'next-intl/server'
import { FeaturesAurora } from '@/components/features/page/FeaturesAurora'
import { FeaturesReveal } from '@/components/features/page/FeaturesReveal'

export async function PrivacyHero() {
  const t = await getTranslations('privacyPage.hero')

  return (
    <section id="privacy-hero" className="relative overflow-x-clip">
      <FeaturesAurora />
      <div className="relative z-10 mx-auto max-w-[720px] px-4 py-14 text-center sm:px-6 sm:py-16 md:py-20 lg:py-24">
        <FeaturesReveal>
          <p className="mb-5 inline-flex items-center rounded-full border border-[#E2E8F0] bg-canvas px-3 py-1 text-xs font-semibold text-positive-deep shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:text-sm">
            {t('badge')}
          </p>
          <h1 className="font-display text-[2.35rem] leading-[1.08] tracking-tight text-ink sm:text-5xl sm:leading-[1.05] md:text-[3.1rem]">
            {t('title')}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-body sm:text-lg sm:leading-8">
            {t('description')}
          </p>
          <p className="mt-8 text-sm text-mute">
            <span className="font-semibold text-ink">{t('updatedLabel')}</span>
            <span className="mx-1.5 text-[#CBD5E1]" aria-hidden>
              ·
            </span>
            <span>{t('updatedDate')}</span>
          </p>
        </FeaturesReveal>
      </div>
    </section>
  )
}
