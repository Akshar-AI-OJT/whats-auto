import { Check, ArrowRight, Calendar } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { HeroDashboardMockup } from './HeroDashboardMockup'

export async function HeroSection() {
  const t = await getTranslations('hero')
  const chips = t.raw('chips') as string[]

  return (
    <section className="relative overflow-x-clip bg-[#F8FAFC]">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-8%] left-[18%] size-[26rem] rounded-full bg-primary/12 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-4%] bottom-[-6%] size-[22rem] rounded-full bg-primary-pale/70 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[28%] left-[-6%] size-[14rem] rounded-full bg-primary/8 blur-[100px]"
      />

      <div className="relative z-10 mx-auto grid max-w-[1200px] gap-12 px-4 py-12 sm:px-6 sm:py-14 md:gap-14 md:py-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-20">
        {/* Left — copy */}
        <div className="animate-hero-fade-up flex min-w-0 flex-col items-start text-left">
          <p className="mb-5 inline-flex items-center rounded-full border border-[#E2E8F0] bg-canvas px-3 py-1 text-xs font-semibold text-positive-deep shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:text-sm">
            {t('badge')}
          </p>

          <h1 className="max-w-[18ch] font-display text-[2.35rem] leading-[1.05] tracking-tight text-ink sm:text-5xl sm:leading-[1.05] md:text-[3.15rem] lg:text-[3.4rem]">
            {t('headline')}
          </h1>

          <p className="mt-5 max-w-md text-base leading-7 text-body sm:text-lg sm:leading-8">
            {t('description')}
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/register"
              className={cn(
                buttonVariants({ size: 'lg' }),
                'group justify-center rounded-xl border-transparent bg-primary text-on-primary',
                'shadow-[0_1px_2px_rgb(14_15_12/0.06),0_8px_18px_rgb(159_232_112/0.4)]',
                'transition-[transform,box-shadow,background] duration-200',
                'hover:-translate-y-0.5 hover:bg-primary-active',
                'hover:shadow-[0_2px_4px_rgb(14_15_12/0.06),0_14px_28px_rgb(159_232_112/0.5)]'
              )}
            >
              {t('cta')}
              <ArrowRight
                className="ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            <Link
              href="/book-demo"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'group justify-center gap-2 rounded-xl border-[#E2E8F0] bg-canvas',
                'transition-[transform,background-color,border-color,box-shadow] duration-200',
                'hover:-translate-y-0.5 hover:border-[#CBD5E1] hover:bg-canvas hover:shadow-sm'
              )}
            >
              <Calendar
                className="size-4 text-mute transition-colors duration-200 group-hover:text-ink"
                aria-hidden
              />
              {t('ctaSecondary')}
            </Link>
          </div>

          <ul className="mt-7 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li
                key={chip}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-canvas px-3 py-1.5 text-xs font-medium text-ink shadow-[0_1px_2px_rgb(15_23_42/0.04)]"
              >
                <Check
                  className="size-3.5 shrink-0 text-positive-deep"
                  strokeWidth={2.5}
                  aria-hidden
                />
                {chip}
              </li>
            ))}
          </ul>
        </div>

        {/* Right — WhatsApp AI conversation mockup */}
        <div
          className="animate-hero-fade-up min-w-0 lg:justify-self-end"
          style={{ animationDelay: '120ms' }}
        >
          <HeroDashboardMockup
            label={t('visualLabel')}
            copy={{
              businessName: t('mock.businessName'),
              businessStatus: t('mock.businessStatus'),
              customerMessage: t('mock.customerMessage'),
              aiReply: t('mock.aiReply'),
              aiLabel: t('mock.aiLabel'),
              timeCustomer: t('mock.timeCustomer'),
              timeAi: t('mock.timeAi'),
              todayLabel: t('mock.todayLabel'),
              composerPlaceholder: t('mock.composerPlaceholder'),
              aiSuggestedReply: t('mock.aiSuggestedReply'),
              automatedResponse: t('mock.automatedResponse'),
              cards: {
                assistantTitle: t('mock.cards.assistantTitle'),
                assistantStatus: t('mock.cards.assistantStatus'),
                broadcastTitle: t('mock.cards.broadcastTitle'),
                broadcastStatus: t('mock.cards.broadcastStatus'),
                inboxTitle: t('mock.cards.inboxTitle'),
                inboxStatus: t('mock.cards.inboxStatus'),
                teamTitle: t('mock.cards.teamTitle'),
                teamStatus: t('mock.cards.teamStatus'),
                authTitle: t('mock.cards.authTitle'),
                authStatus: t('mock.cards.authStatus'),
                templatesTitle: t('mock.cards.templatesTitle'),
                templatesStatus: t('mock.cards.templatesStatus'),
              },
            }}
          />
        </div>
      </div>
    </section>
  )
}
