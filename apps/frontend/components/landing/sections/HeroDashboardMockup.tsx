import {
  Bot,
  FileText,
  Megaphone,
  MessagesSquare,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const cardShell = cn(
  'rounded-xl border border-[#E2E8F0] bg-canvas',
  'shadow-[0_10px_32px_rgb(15_23_42/0.07),0_2px_6px_rgb(15_23_42/0.04)]',
  'transition-[transform,box-shadow] duration-200 ease-out',
  'hover:-translate-y-1 hover:shadow-[0_14px_36px_rgb(15_23_42/0.1),0_4px_10px_rgb(15_23_42/0.05)]'
)

export type HeroPhoneMockCopy = {
  businessName: string
  businessStatus: string
  customerMessage: string
  aiReply: string
  aiLabel: string
  timeCustomer: string
  timeAi: string
  todayLabel: string
  composerPlaceholder: string
  aiSuggestedReply: string
  automatedResponse: string
  cards: {
    assistantTitle: string
    assistantStatus: string
    broadcastTitle: string
    broadcastStatus: string
    inboxTitle: string
    inboxStatus: string
    teamTitle: string
    teamStatus: string
    authTitle: string
    authStatus: string
    templatesTitle: string
    templatesStatus: string
  }
}

function Float({
  className,
  delayMs,
  durationSec = 7,
  children,
}: {
  className?: string
  delayMs: number
  durationSec?: number
  children: React.ReactNode
}) {
  return (
    <div
      className={cn('animate-hero-float absolute', className)}
      style={{
        animationDelay: `${delayMs}ms`,
        animationDuration: `${durationSec}s`,
      }}
    >
      {children}
    </div>
  )
}

function CapabilityCard({
  title,
  status,
  icon,
  iconWrapClassName,
}: {
  title: string
  status: string
  icon: React.ReactNode
  iconWrapClassName: string
}) {
  return (
    <div className={cn(cardShell, 'flex w-[10.5rem] items-center gap-2.5 p-2.5 sm:w-[11rem]')}>
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg',
          iconWrapClassName
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-ink sm:text-xs">{title}</p>
        <p className="truncate text-[10px] font-medium text-mute">{status}</p>
      </div>
    </div>
  )
}

/** WhatsApp AI conversation phone with evenly spaced capability cards. */
export function HeroDashboardMockup({
  label,
  copy,
}: {
  label: string
  copy: HeroPhoneMockCopy
}) {
  const { cards } = copy

  return (
    <div
      className="relative mx-auto h-[460px] w-full max-w-[460px] sm:h-[500px] sm:max-w-[500px] md:h-[540px] lg:mx-0 lg:max-w-none"
      role="img"
      aria-label={label}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/14 blur-[110px] sm:size-[300px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[12%] right-[8%] size-[120px] rounded-full bg-primary-pale/60 blur-[80px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[10%] left-[8%] size-[110px] rounded-full bg-primary/10 blur-[70px]"
      />

      {/* Centered phone */}
      <div className="absolute top-1/2 left-1/2 z-20 w-[196px] -translate-x-1/2 -translate-y-1/2 sm:w-[216px] md:w-[228px]">
        <div
          className={cn(
            'relative overflow-hidden rounded-[2rem] border-[6px] border-ink bg-ink',
            'shadow-[0_24px_60px_rgb(15_23_42/0.16),0_4px_12px_rgb(15_23_42/0.07)]'
          )}
        >
          <div
            aria-hidden
            className="absolute top-0 left-1/2 z-30 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-ink"
          />

          <div className="overflow-hidden rounded-[1.55rem] bg-[#ECE5DD]">
            <div className="relative bg-[#075E54] px-3 pt-6 pb-2.5 text-canvas">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
                  WA
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">
                    {copy.businessName}
                  </p>
                  <p className="truncate text-[10px] text-canvas/75">
                    {copy.businessStatus}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex min-h-[268px] flex-col gap-2.5 bg-[linear-gradient(180deg,#e5ddd5_0%,#ece5dd_40%,#e8e0d5_100%)] px-2.5 py-3 sm:min-h-[300px]">
              <div className="self-center rounded-full bg-ink/10 px-2.5 py-0.5 text-[9px] font-medium text-ink/70">
                {copy.todayLabel}
              </div>

              <div className="max-w-[90%] self-start">
                <div className="rounded-2xl rounded-tl-sm bg-canvas px-2.5 py-2 shadow-sm">
                  <p className="text-[11px] leading-4 text-ink sm:text-xs sm:leading-5">
                    {copy.customerMessage}
                  </p>
                  <p className="mt-1 text-right text-[9px] text-mute">
                    {copy.timeCustomer}
                  </p>
                </div>
              </div>

              <div className="max-w-[92%] self-end">
                <div className="rounded-2xl rounded-tr-sm bg-[#DCF8C6] px-2.5 py-2 shadow-sm">
                  <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-positive/15 px-1.5 py-0.5 text-[9px] font-semibold text-positive-deep">
                    <Bot className="size-2.5" aria-hidden />
                    {copy.aiLabel}
                  </div>
                  <p className="whitespace-pre-line text-[11px] leading-4 text-ink sm:text-xs sm:leading-5">
                    {copy.aiReply}
                  </p>
                  <p className="mt-1 text-right text-[9px] text-mute">{copy.timeAi}</p>
                </div>
              </div>

              <div className="mt-auto flex flex-col gap-1.5 pt-1">
                <div className="inline-flex items-center gap-1.5 self-start rounded-full border border-[#E2E8F0]/80 bg-canvas/95 px-2 py-1 text-[9px] font-semibold text-positive-deep shadow-sm">
                  <span aria-hidden>✓</span>
                  {copy.aiSuggestedReply}
                </div>
                <div className="inline-flex items-center gap-1.5 self-start rounded-full border border-[#E2E8F0]/80 bg-canvas/95 px-2 py-1 text-[9px] font-semibold text-positive-deep shadow-sm">
                  <span aria-hidden>✓</span>
                  {copy.automatedResponse}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-[#F0F2F5] px-2 py-2">
              <div className="h-8 flex-1 rounded-full bg-canvas px-3 text-[10px] leading-8 text-mute">
                {copy.composerPlaceholder}
              </div>
              <span className="flex size-8 items-center justify-center rounded-full bg-[#075E54] text-canvas">
                <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden>
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Capability cards — evenly spaced around phone, no overlap */}
      <Float
        className="top-[2%] left-[2%] z-30 sm:left-[4%]"
        delayMs={0}
        durationSec={6.5}
      >
        <CapabilityCard
          title={cards.assistantTitle}
          status={cards.assistantStatus}
          iconWrapClassName="bg-primary-pale text-positive-deep"
          icon={<Bot className="size-3.5" aria-hidden />}
        />
      </Float>

      <Float
        className="top-[2%] right-[2%] z-30 sm:right-[4%]"
        delayMs={700}
        durationSec={7.5}
      >
        <CapabilityCard
          title={cards.broadcastTitle}
          status={cards.broadcastStatus}
          iconWrapClassName="bg-ink text-primary"
          icon={<Megaphone className="size-3.5" aria-hidden />}
        />
      </Float>

      <Float
        className="top-[38%] left-0 z-30 hidden sm:block"
        delayMs={1200}
        durationSec={7}
      >
        <CapabilityCard
          title={cards.inboxTitle}
          status={cards.inboxStatus}
          iconWrapClassName="bg-[#F1F5F9] text-positive-deep"
          icon={<MessagesSquare className="size-3.5" aria-hidden />}
        />
      </Float>

      <Float
        className="top-[38%] right-0 z-30 hidden sm:block"
        delayMs={1600}
        durationSec={8}
      >
        <CapabilityCard
          title={cards.teamTitle}
          status={cards.teamStatus}
          iconWrapClassName="bg-primary text-on-primary"
          icon={<Users className="size-3.5" aria-hidden />}
        />
      </Float>

      <Float
        className="bottom-[3%] left-[2%] z-30 sm:bottom-[5%] sm:left-[4%]"
        delayMs={2000}
        durationSec={6.8}
      >
        <CapabilityCard
          title={cards.authTitle}
          status={cards.authStatus}
          iconWrapClassName="bg-primary-pale text-positive-deep"
          icon={<ShieldCheck className="size-3.5" aria-hidden />}
        />
      </Float>

      <Float
        className="right-[2%] bottom-[3%] z-30 sm:right-[4%] sm:bottom-[5%]"
        delayMs={2400}
        durationSec={7.8}
      >
        <CapabilityCard
          title={cards.templatesTitle}
          status={cards.templatesStatus}
          iconWrapClassName="bg-[#F1F5F9] text-ink"
          icon={<FileText className="size-3.5" aria-hidden />}
        />
      </Float>
    </div>
  )
}
