import {
  BarChart3,
  Bot,
  Building2,
  Megaphone,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'

const FEATURE_KEYS = [
  'aiAssistant',
  'broadcast',
  'inbox',
  'whatsappApi',
  'analytics',
  'multiTenant',
] as const

const FEATURE_ICONS: Record<(typeof FEATURE_KEYS)[number], LucideIcon> = {
  aiAssistant: Bot,
  broadcast: Megaphone,
  inbox: Users,
  whatsappApi: ShieldCheck,
  analytics: BarChart3,
  multiTenant: Building2,
}

export async function WhyWhatsAutoSection() {
  const t = await getTranslations('landing.whyWhatsAuto')

  return (
    <section
      id="why-whats-auto"
      className="relative scroll-mt-24 overflow-x-clip bg-[#F8FAFC]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-1/4 size-[22rem] rounded-full bg-primary/10 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-[10%] size-[18rem] rounded-full bg-primary-pale/60 blur-[100px]"
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-4 py-16 sm:px-6 md:py-20 lg:py-24">
        <div className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
          <p className="mb-4 inline-flex items-center rounded-full border border-[#E2E8F0] bg-canvas px-3 py-1 text-xs font-semibold text-positive-deep shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:text-sm">
            {t('badge')}
          </p>
          <h2 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-body sm:text-lg sm:leading-8">
            {t('subtitle')}
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
          {FEATURE_KEYS.map((key) => {
            const Icon = FEATURE_ICONS[key]

            return (
              <li key={key} className="h-full">
                <article
                  className={cn(
                    'group flex h-full flex-col rounded-2xl border border-[#E2E8F0] bg-canvas p-6',
                    'shadow-[0_10px_32px_rgb(15_23_42/0.06),0_2px_6px_rgb(15_23_42/0.03)]',
                    'transition-[transform,box-shadow] duration-[250ms] ease-out',
                    'hover:-translate-y-1 hover:shadow-[0_16px_40px_rgb(15_23_42/0.1),0_4px_10px_rgb(15_23_42/0.05)]'
                  )}
                >
                  <span
                    className={cn(
                      'mb-4 flex size-11 items-center justify-center rounded-xl',
                      'bg-primary-pale text-positive-deep',
                      'transition-[box-shadow,background-color] duration-[250ms] ease-out',
                      'group-hover:bg-primary/20',
                      'group-hover:shadow-[0_0_0_4px_rgb(37_99_235/0.25),0_8px_20px_rgb(37_99_235/0.35)]'
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="text-base font-semibold tracking-tight text-ink sm:text-lg">
                    {t(`items.${key}.title`)}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-body sm:text-[15px] sm:leading-7">
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
