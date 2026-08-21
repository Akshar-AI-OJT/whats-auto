import { Target } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { FeaturesAurora } from '@/components/features/page/FeaturesAurora'
import { FeaturesReveal } from '@/components/features/page/FeaturesReveal'
import { cn } from '@/lib/utils'

export async function AboutMission() {
  const t = await getTranslations('aboutPage.mission')

  return (
    <section
      id="our-mission"
      className="relative scroll-mt-24 overflow-x-clip bg-[#F8FAFC] py-16 sm:py-20 md:py-24"
    >
      <FeaturesAurora />
      <div className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-6">
        <FeaturesReveal>
          <div className="relative mx-auto max-w-3xl">
            <div
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2 size-[18rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[90px] sm:size-[22rem]"
            />

            <article
              className={cn(
                'relative rounded-[28px] border border-[#E2E8F0] bg-canvas/90 px-6 py-10 text-center backdrop-blur-sm sm:px-12 sm:py-14',
                'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_16px_40px_rgb(15_23_42/0.06),0_0_0_1px_rgb(37_99_235/0.08)]'
              )}
            >
              <span
                className={cn(
                  'mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl sm:size-16',
                  'bg-primary-pale text-positive-deep',
                  'shadow-[0_0_0_6px_rgb(37_99_235/0.18),0_10px_24px_rgb(37_99_235/0.28)]'
                )}
              >
                <Target className="size-6 sm:size-7" aria-hidden />
              </span>

              <h2 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
                {t('title')}
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-body sm:text-lg sm:leading-8">
                {t('content')}
              </p>
            </article>
          </div>
        </FeaturesReveal>
      </div>
    </section>
  )
}
