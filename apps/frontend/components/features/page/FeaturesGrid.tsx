import {
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  FileText,
  Megaphone,
  ShieldCheck,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'
import { FeaturesReveal } from './FeaturesReveal'

const GRID_KEYS = [
  'ai',
  'broadcast',
  'inbox',
  'analytics',
  'multiTenant',
  'auth',
  'workflow',
  'templates',
] as const

const GRID_ICONS: Record<(typeof GRID_KEYS)[number], LucideIcon> = {
  ai: Bot,
  broadcast: Megaphone,
  inbox: Users,
  analytics: BarChart3,
  multiTenant: Building2,
  auth: ShieldCheck,
  workflow: Workflow,
  templates: FileText,
}

export async function FeaturesGrid() {
  const t = await getTranslations('featuresPage.grid')

  return (
    <section className="relative scroll-mt-24 bg-canvas py-16 sm:py-20 md:py-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <FeaturesReveal className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
          <h2 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
            {t('title')}
          </h2>
          <p className="mt-4 text-base leading-7 text-body sm:text-lg">{t('subtitle')}</p>
        </FeaturesReveal>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {GRID_KEYS.map((key, i) => {
            const Icon = GRID_ICONS[key]
            const bullets = t.raw(`items.${key}.bullets`) as string[]

            return (
              <li key={key}>
                <FeaturesReveal delayMs={i * 40} className="h-full">
                  <article
                    className={cn(
                      'group relative flex h-full flex-col rounded-[28px] border border-[#E2E8F0] bg-canvas p-6',
                      'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_rgb(15_23_42/0.05)]',
                      'transition-[transform,box-shadow,border-color] duration-200 ease-out',
                      'hover:-translate-y-1 hover:border-primary/60',
                      'hover:shadow-[0_16px_40px_rgb(15_23_42/0.1),0_0_0_4px_rgb(159_232_112/0.18)]'
                    )}
                  >
                    <span
                      className={cn(
                        'mb-4 flex size-12 items-center justify-center rounded-2xl',
                        'bg-primary-pale text-positive-deep',
                        'transition-[transform,box-shadow,background-color] duration-200',
                        'group-hover:scale-105 group-hover:bg-primary/25',
                        'group-hover:shadow-[0_0_0_4px_rgb(159_232_112/0.22),0_8px_20px_rgb(159_232_112/0.3)]'
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="text-base font-semibold tracking-tight text-ink sm:text-lg">
                      {t(`items.${key}.title`)}
                    </h3>
                    <ul className="mt-3 flex flex-1 flex-col gap-1.5">
                      {bullets.map((bullet) => (
                        <li key={bullet} className="text-sm leading-6 text-body">
                          {bullet}
                        </li>
                      ))}
                    </ul>
                    <ArrowRight
                      className="mt-4 size-4 text-primary opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
                      aria-hidden
                    />
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
