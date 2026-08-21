import {
  HeartHandshake,
  Lightbulb,
  Lock,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { FeaturesAurora } from '@/components/features/page/FeaturesAurora'
import { FeaturesReveal } from '@/components/features/page/FeaturesReveal'
import { cn } from '@/lib/utils'

const VALUE_KEYS = [
  'innovation',
  'reliability',
  'security',
  'customerFirst',
] as const

const VALUE_ICONS: Record<(typeof VALUE_KEYS)[number], LucideIcon> = {
  innovation: Lightbulb,
  reliability: ShieldCheck,
  security: Lock,
  customerFirst: HeartHandshake,
}

export async function AboutValues() {
  const t = await getTranslations('aboutPage.values')

  return (
    <section
      id="core-values"
      className="relative scroll-mt-24 overflow-x-clip bg-[#F8FAFC] py-16 sm:py-20 md:py-24"
    >
      <FeaturesAurora />
      <div className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-6">
        <FeaturesReveal className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
          <h2 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
            {t('title')}
          </h2>
        </FeaturesReveal>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:gap-6">
          {VALUE_KEYS.map((key, index) => {
            const Icon = VALUE_ICONS[key]
            return (
              <li key={key} className="h-full">
                <FeaturesReveal delayMs={index * 60} className="h-full">
                  <article
                    className={cn(
                      'group flex h-full flex-col rounded-[28px] border border-[#E2E8F0] bg-canvas/90 p-6 backdrop-blur-sm sm:p-7',
                      'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_rgb(15_23_42/0.05)]',
                      'transition-[transform,box-shadow,border-color] duration-200 ease-out',
                      'hover:-translate-y-1 hover:border-primary/55',
                      'hover:shadow-[0_16px_40px_rgb(15_23_42/0.1),0_0_0_4px_rgb(37_99_235/0.18)]'
                    )}
                  >
                    <span
                      className={cn(
                        'mb-4 flex size-12 items-center justify-center rounded-2xl',
                        'bg-primary-pale text-positive-deep',
                        'transition-[transform,box-shadow,background-color] duration-200',
                        'group-hover:scale-105 group-hover:bg-primary/20',
                        'group-hover:shadow-[0_0_0_4px_rgb(37_99_235/0.22),0_8px_20px_rgb(37_99_235/0.3)]'
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="text-base font-semibold tracking-tight text-ink sm:text-lg">
                      {t(`items.${key}.title`)}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-body sm:text-[15px] sm:leading-7">
                      {t(`items.${key}.description`)}
                    </p>
                  </article>
                </FeaturesReveal>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
