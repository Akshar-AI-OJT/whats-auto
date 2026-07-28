import {
  BarChart3,
  Bot,
  Check,
  Megaphone,
  MessagesSquare,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'
import { FeaturesAurora } from './FeaturesAurora'
import { FeaturesReveal } from './FeaturesReveal'

const SPOTLIGHTS = [
  { key: 'ai', Icon: Bot, visual: 'ai' as const },
  { key: 'broadcast', Icon: Megaphone, visual: 'broadcast' as const },
  { key: 'inbox', Icon: MessagesSquare, visual: 'inbox' as const },
  { key: 'analytics', Icon: BarChart3, visual: 'analytics' as const },
] as const

function SpotlightVisual({
  kind,
  label,
}: {
  kind: 'ai' | 'broadcast' | 'inbox' | 'analytics'
  label: string
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        'relative overflow-hidden rounded-[28px] border border-[#E2E8F0] bg-canvas p-5 sm:p-6',
        'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_20px_50px_rgb(15_23_42/0.08)]'
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-8 size-40 rounded-full bg-primary/15 blur-3xl"
      />

      {kind === 'ai' && (
        <div className="relative space-y-3">
          <div className="rounded-2xl bg-[#F8FAFC] px-3 py-2 text-xs text-body">
            Hi, what are today’s offers?
          </div>
          <div className="ml-auto max-w-[90%] rounded-2xl bg-[#DCF8C6] px-3 py-2 text-xs text-ink">
            <span className="mb-1 inline-flex items-center gap-1 text-[10px] font-semibold text-positive-deep">
              <Bot className="size-3" /> AI Assistant
            </span>
            <p>Here are today’s deals — want catalog or pricing next?</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-[#E2E8F0] bg-canvas px-2.5 py-1 text-[10px] font-semibold text-positive-deep">
              ✓ AI Suggested Reply
            </span>
            <span className="rounded-full border border-[#E2E8F0] bg-canvas px-2.5 py-1 text-[10px] font-semibold text-positive-deep">
              ✓ Human Handoff Ready
            </span>
          </div>
        </div>
      )}

      {kind === 'broadcast' && (
        <div className="relative space-y-3">
          <div className="flex items-center justify-between rounded-2xl bg-[#F8FAFC] px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold text-ink">Weekend Offers</p>
              <p className="text-[10px] text-mute">Scheduled · Tomorrow 10:00</p>
            </div>
            <Megaphone className="size-4 text-positive-deep" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['Segment', 'Draft', 'Send'].map((step) => (
              <div
                key={step}
                className="rounded-xl border border-[#E2E8F0] bg-canvas px-2 py-3 text-center text-[10px] font-semibold text-ink"
              >
                {step}
              </div>
            ))}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#F1F5F9]">
            <div className="h-full w-2/3 rounded-full bg-primary" />
          </div>
          <p className="text-[10px] font-medium text-mute">Delivery in progress</p>
        </div>
      )}

      {kind === 'inbox' && (
        <div className="relative space-y-2">
          {['Priya · Assigned to you', 'Rahul · Needs follow-up', 'Team note · Check SLA'].map(
            (row, i) => (
              <div
                key={row}
                className={cn(
                  'flex items-center gap-2.5 rounded-2xl border border-[#E2E8F0] px-3 py-2.5',
                  i === 0 ? 'bg-primary-pale/50' : 'bg-canvas'
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary">
                  {row.slice(0, 1)}
                </span>
                <p className="truncate text-xs font-medium text-ink">{row}</p>
              </div>
            )
          )}
        </div>
      )}

      {kind === 'analytics' && (
        <div className="relative space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Reply rate', value: 'Trend' },
              { label: 'Response time', value: 'Live' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3"
              >
                <p className="text-[10px] font-medium text-mute">{stat.label}</p>
                <p className="mt-1 text-sm font-semibold text-ink">{stat.value}</p>
              </div>
            ))}
          </div>
          <div className="flex h-24 items-end gap-1.5 rounded-2xl bg-[#F8FAFC] px-3 py-3">
            {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md bg-primary/80"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <p className="text-[10px] font-medium text-mute">
            Campaign performance overview
          </p>
        </div>
      )}
    </div>
  )
}

export async function FeaturesSpotlights() {
  const t = await getTranslations('featuresPage.spotlights')

  return (
    <section
      id="built-for-workflows"
      className="relative scroll-mt-24 overflow-x-clip py-16 sm:py-20 md:py-24"
    >
      <FeaturesAurora />
      <div className="relative z-10 mx-auto max-w-[1200px] space-y-16 px-4 sm:px-6 md:space-y-24">
        <FeaturesReveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
            {t('title')}
          </h2>
          <p className="mt-4 text-base leading-7 text-body sm:text-lg">{t('subtitle')}</p>
        </FeaturesReveal>

        {SPOTLIGHTS.map(({ key, Icon, visual }, index) => {
          const reverse = index % 2 === 1
          const points = t.raw(`items.${key}.points`) as string[]

          return (
            <FeaturesReveal key={key} delayMs={60}>
              <div
                className={cn(
                  'grid items-center gap-8 lg:grid-cols-2 lg:gap-14',
                  reverse && 'lg:[&>*:first-child]:order-2'
                )}
              >
                <SpotlightVisual kind={visual} label={t(`items.${key}.visualLabel`)} />
                <div>
                  <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
                    {t(`items.${key}.title`)}
                  </h3>
                  <p className="mt-3 max-w-md text-base leading-7 text-body">
                    {t(`items.${key}.description`)}
                  </p>
                  <ul className="mt-6 flex flex-col gap-3">
                    {points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-sm text-ink sm:text-[15px]">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-positive-deep">
                          <Check className="size-3 stroke-[2.5]" aria-hidden />
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </FeaturesReveal>
          )
        })}
      </div>
    </section>
  )
}
