import {
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  Megaphone,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { featuresOutlineBtn } from '@/components/features/page/features-styles'

const PREVIEW_KEYS = [
  'ai',
  'broadcast',
  'inbox',
  'analytics',
  'multiTenant',
  'auth',
] as const

const PREVIEW_ICONS: Record<(typeof PREVIEW_KEYS)[number], LucideIcon> = {
  ai: Bot,
  broadcast: Megaphone,
  inbox: Users,
  analytics: BarChart3,
  multiTenant: Building2,
  auth: ShieldCheck,
}

export async function FeaturePreviewSection() {
  const t = await getTranslations('landing.featurePreview')

  return (
    <section
      id="feature-preview"
      className="relative scroll-mt-24 overflow-x-clip bg-canvas py-16 sm:py-20 md:py-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/4 size-[20rem] rounded-full bg-primary/10 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 size-[16rem] rounded-full bg-primary-pale/50 blur-[100px]"
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

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
          {PREVIEW_KEYS.map((key) => {
            const Icon = PREVIEW_ICONS[key]

            return (
              <li key={key} className="h-full">
                <article
                  className={cn(
                    'group flex h-full flex-col rounded-3xl border border-[#E2E8F0] bg-canvas p-6',
                    'shadow-[0_10px_32px_rgb(15_23_42/0.06),0_2px_6px_rgb(15_23_42/0.03)]',
                    'transition-[transform,box-shadow,border-color] duration-200 ease-out',
                    'hover:-translate-y-1 hover:border-primary/55',
                    'hover:shadow-[0_16px_40px_rgb(15_23_42/0.1),0_0_0_4px_rgb(159_232_112/0.15)]'
                  )}
                >
                  <span
                    className={cn(
                      'mb-4 flex size-12 items-center justify-center rounded-2xl',
                      'bg-primary-pale text-positive-deep',
                      'transition-[transform,box-shadow,background-color] duration-200',
                      'group-hover:scale-105 group-hover:bg-primary/20',
                      'group-hover:shadow-[0_0_0_4px_rgb(159_232_112/0.2)]'
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="text-base font-semibold tracking-tight text-ink sm:text-lg">
                    {t(`items.${key}.title`)}
                  </h3>
                  <p className="mt-2 line-clamp-2 flex-1 text-sm leading-6 text-body">
                    {t(`items.${key}.description`)}
                  </p>
                  <ArrowRight
                    className="mt-4 size-4 text-primary opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
                    aria-hidden
                  />
                </article>
              </li>
            )
          })}
        </ul>

        <div className="mt-10 flex justify-center md:mt-12">
          <Link
            href="/features"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              featuresOutlineBtn,
              'group justify-center gap-2'
            )}
          >
            {t('cta')}
            <ArrowRight
              className="size-4 text-mute transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink"
              aria-hidden
            />
          </Link>
        </div>
      </div>
    </section>
  )
}
