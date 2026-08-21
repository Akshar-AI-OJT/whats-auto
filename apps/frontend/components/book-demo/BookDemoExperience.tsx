import {
  Bot,
  MessagesSquare,
  MonitorPlay,
  Rocket,
  type LucideIcon,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'

const CARD_KEYS = ['walkthrough', 'ai', 'qa', 'practices'] as const

const CARD_ICONS: Record<(typeof CARD_KEYS)[number], LucideIcon> = {
  walkthrough: MonitorPlay,
  ai: Bot,
  qa: MessagesSquare,
  practices: Rocket,
}

export async function BookDemoExperience() {
  const t = await getTranslations('bookDemoPage.experience')

  return (
    <section
      id="what-youll-experience"
      className="relative scroll-mt-24 overflow-x-clip bg-canvas py-16 sm:py-20 md:py-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-1/4 size-[18rem] rounded-full bg-primary/10 blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-[10%] size-[14rem] rounded-full bg-primary-pale/50 blur-[90px]"
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
          <p className="mb-4 inline-flex items-center rounded-full border border-[#E2E8F0] bg-canvas px-3 py-1 text-xs font-semibold text-positive-deep shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:text-sm">
            {t('badge')}
          </p>
          <h2 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
            {t('title')}
          </h2>
          <p className="mt-4 text-base leading-7 text-body sm:text-lg sm:leading-8">
            {t('subtitle')}
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:gap-6">
          {CARD_KEYS.map((key) => {
            const Icon = CARD_ICONS[key]

            return (
              <li key={key} className="h-full">
                <article
                  className={cn(
                    'group flex h-full flex-col rounded-[28px] border border-[#E2E8F0] bg-canvas/90 p-6 backdrop-blur-sm',
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
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
