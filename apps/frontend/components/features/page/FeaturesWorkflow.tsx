import {
  ArrowRight,
  BarChart3,
  Bot,
  Contact,
  Megaphone,
  Plug,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'
import { FeaturesReveal } from './FeaturesReveal'

const STEP_ICONS = [Plug, Contact, Megaphone, Bot, BarChart3] as const
const STEP_KEYS = ['connect', 'import', 'launch', 'ai', 'track'] as const

export async function FeaturesWorkflow() {
  const t = await getTranslations('featuresPage.workflow')

  return (
    <section id="how-it-works" className="scroll-mt-24 bg-canvas py-16 sm:py-20 md:py-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <FeaturesReveal className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
          <h2 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
            {t('title')}
          </h2>
          <p className="mt-4 text-base leading-7 text-body sm:text-lg">{t('subtitle')}</p>
        </FeaturesReveal>

        <ol className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0">
          {STEP_KEYS.map((key, i) => {
            const Icon = STEP_ICONS[i]
            const isLast = i === STEP_KEYS.length - 1

            return (
              <li key={key} className="flex flex-1 flex-col md:min-w-0 md:flex-row md:items-stretch">
                <FeaturesReveal delayMs={i * 90} className="h-full w-full md:min-w-0 md:flex-1">
                  <div
                    className={cn(
                      'flex h-full flex-col rounded-[28px] border border-[#E2E8F0] bg-[#F8FAFC] p-5',
                      'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_rgb(15_23_42/0.05)]',
                      'transition-[transform,box-shadow] duration-200 hover:-translate-y-1',
                      'hover:shadow-[0_14px_36px_rgb(15_23_42/0.09)]'
                    )}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <span className="flex size-10 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="text-xs font-semibold text-mute">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-ink">{t(`steps.${key}.title`)}</h3>
                    <p className="mt-2 flex-1 text-sm leading-6 text-body">
                      {t(`steps.${key}.description`)}
                    </p>
                  </div>
                </FeaturesReveal>

                {!isLast ? (
                  <div
                    aria-hidden
                    className="flex items-center justify-center py-1 text-primary md:w-6 md:shrink-0 md:px-0 lg:w-8"
                  >
                    <ArrowRight className="hidden size-4 md:block" />
                    <span className="md:hidden">↓</span>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
