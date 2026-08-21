import { CalendarClock } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { FeaturesReveal } from '@/components/features/page/FeaturesReveal'
import { cn } from '@/lib/utils'

export async function TermsUpdated() {
  const t = await getTranslations('termsPage.updated')

  return (
    <section className="relative scroll-mt-24 overflow-x-clip bg-canvas pb-2 sm:pb-4">
      <div className="relative z-10 mx-auto max-w-[800px] px-4 sm:px-6">
        <FeaturesReveal>
          <div
            className={cn(
              'flex flex-col items-center gap-3 rounded-[24px] border border-[#E2E8F0] bg-canvas/90 px-5 py-5 text-center backdrop-blur-sm sm:flex-row sm:justify-between sm:px-6 sm:text-left',
              'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_rgb(15_23_42/0.05)]'
            )}
          >
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep shadow-[0_0_0_4px_rgb(37_99_235/0.16)]">
                <CalendarClock className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold tracking-tight text-ink">
                  {t('label')}
                </p>
                <p className="mt-0.5 text-sm text-body">{t('date')}</p>
              </div>
            </div>
            <p className="max-w-sm text-sm leading-6 text-mute sm:text-right">
              {t('note')}
            </p>
          </div>
        </FeaturesReveal>
      </div>
    </section>
  )
}
