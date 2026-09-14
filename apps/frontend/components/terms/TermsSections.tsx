import { getTranslations } from 'next-intl/server'
import { FeaturesReveal } from '@/components/features/page/FeaturesReveal'
import { cn } from '@/lib/utils'

const SECTION_KEYS = [
  'acceptance',
  'accounts',
  'acceptableUse',
  'intellectualProperty',
  'availability',
  'liability',
  'updates',
  'governingLaw',
] as const

export async function TermsSections() {
  const t = await getTranslations('termsPage.sections')

  return (
    <div id="terms-conditions" className="space-y-4 sm:space-y-5">
      {SECTION_KEYS.map((key, index) => (
        <FeaturesReveal key={key} delayMs={Math.min(index * 35, 200)}>
          <article
            id={key}
            className={cn(
              'scroll-mt-28 rounded-[28px] border border-[#E2E8F0] bg-canvas/90 p-6 backdrop-blur-sm sm:p-7 md:p-8',
              'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_rgb(15_23_42/0.05)]',
              'transition-[transform,box-shadow,border-color] duration-200 ease-out',
              'hover:-translate-y-0.5 hover:border-primary/40',
              'hover:shadow-[0_16px_40px_rgb(15_23_42/0.08),0_0_0_4px_rgb(37_99_235/0.12)]'
            )}
          >
            <div className="mb-4 flex items-start gap-3.5">
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-2xl',
                  'bg-primary-pale text-sm font-bold text-positive-deep',
                  'shadow-[0_0_0_4px_rgb(37_99_235/0.14)]'
                )}
              >
                {index + 1}
              </span>
              <h2 className="pt-1.5 font-display text-xl leading-snug tracking-tight text-ink sm:text-2xl">
                {t(`${key}.title`)}
              </h2>
            </div>

            <p className="text-sm leading-7 text-body sm:pl-[3.375rem] sm:text-[15px] sm:leading-7">
              {t(`${key}.content`)}
            </p>
          </article>
        </FeaturesReveal>
      ))}
    </div>
  )
}
