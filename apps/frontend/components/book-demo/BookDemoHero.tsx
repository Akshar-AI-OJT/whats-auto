import { Clock3 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { FeaturesAurora } from '@/components/features/page/FeaturesAurora'
import { BookDemoHeroIllustration } from './BookDemoHeroIllustration'
import { BookDemoScrollButton } from './BookDemoScrollButton'

export async function BookDemoHero() {
  const t = await getTranslations('bookDemoPage.hero')

  return (
    <section id="book-demo-hero" className="relative overflow-x-clip">
      <FeaturesAurora />
      <div className="relative z-10 mx-auto grid max-w-[1200px] gap-12 px-4 py-14 sm:px-6 sm:py-16 md:gap-14 md:py-20 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
        <div className="animate-hero-fade-up flex min-w-0 flex-col items-start text-left">
          <p className="mb-5 inline-flex items-center rounded-full border border-[#E2E8F0] bg-canvas px-3 py-1 text-xs font-semibold text-positive-deep shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:text-sm">
            {t('badge')}
          </p>

          <h1 className="max-w-[16ch] font-display text-[2.35rem] leading-[1.05] tracking-tight text-ink sm:text-5xl sm:leading-[1.05] md:text-[3.15rem] lg:text-[3.4rem]">
            {t('title')}
          </h1>

          <p className="mt-5 max-w-md text-base leading-7 text-body sm:text-lg sm:leading-8">
            {t('description')}
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <BookDemoScrollButton label={t('cta')} />
            <p className="inline-flex items-center gap-2 px-1 text-sm font-medium text-mute sm:px-2">
              <Clock3 className="size-4 shrink-0 text-positive-deep" aria-hidden />
              {t('meta')}
            </p>
          </div>
        </div>

        <div
          className="animate-hero-fade-up min-w-0 lg:justify-self-end"
          style={{ animationDelay: '120ms' }}
        >
          <BookDemoHeroIllustration
            copy={{
              label: t('visualLabel'),
              title: t('illustration.title'),
              subtitle: t('illustration.subtitle'),
              meetLabel: t('illustration.meetLabel'),
              duration: t('illustration.duration'),
              aiChip: t('illustration.aiChip'),
              calendarChip: t('illustration.calendarChip'),
              meetChip: t('illustration.meetChip'),
            }}
          />
        </div>
      </div>
    </section>
  )
}
