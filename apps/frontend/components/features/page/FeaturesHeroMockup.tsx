import {
  BarChart3,
  Bot,
  Building2,
  Megaphone,
  MessagesSquare,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { authFloatingCardClassName } from '@/components/auth/auth-field-styles'

type Chip = { label: string; icon: React.ReactNode; tone: string }

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
      className={cn('animate-hero-float absolute z-30', className)}
      style={{
        animationDelay: `${delayMs}ms`,
        animationDuration: `${durationSec}s`,
      }}
    >
      {children}
    </div>
  )
}

function Chip({ label, icon, tone }: Chip) {
  return (
    <div
      className={cn(
        authFloatingCardClassName,
        'flex items-center gap-2 rounded-xl px-2.5 py-2',
        'transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5'
      )}
    >
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-lg',
          tone
        )}
      >
        {icon}
      </span>
      <p className="truncate text-[11px] font-semibold text-ink">{label}</p>
    </div>
  )
}

export type FeaturesHeroMockCopy = {
  workspaceTitle: string
  inboxLabel: string
  online: string
  threadName: string
  customerMsg: string
  aiMsg: string
  aiBadge: string
  chips: {
    ai: string
    broadcast: string
    inbox: string
    analytics: string
    auth: string
    tenant: string
  }
}

/** Premium WhatsApp workspace preview with floating capability chips. */
export function FeaturesHeroMockup({
  label,
  copy,
}: {
  label: string
  copy: FeaturesHeroMockCopy
}) {
  const { chips } = copy

  return (
    <div
      className="relative mx-auto h-[420px] w-full max-w-[440px] sm:h-[460px] sm:max-w-[480px] lg:mx-0 lg:max-w-none"
      role="img"
      aria-label={label}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/14 blur-[100px]"
      />

      {/* Workspace card */}
      <div
        className={cn(
          'absolute top-1/2 left-1/2 z-20 w-[min(100%,280px)] -translate-x-1/2 -translate-y-1/2 sm:w-[300px]',
          'overflow-hidden rounded-[28px] border border-[#E2E8F0] bg-canvas',
          'shadow-[0_24px_60px_rgb(15_23_42/0.12),0_4px_12px_rgb(15_23_42/0.06)]'
        )}
      >
        <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-ink">{copy.workspaceTitle}</p>
            <p className="text-[10px] font-medium text-mute">{copy.inboxLabel}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-pale px-2 py-0.5 text-[10px] font-semibold text-positive-deep">
            <span className="size-1.5 rounded-full bg-positive" aria-hidden />
            {copy.online}
          </span>
        </div>

        <div className="border-b border-[#E2E8F0] bg-[#075E54] px-3 py-2.5 text-canvas">
          <p className="text-xs font-semibold">{copy.threadName}</p>
        </div>

        <div className="flex min-h-[220px] flex-col gap-2.5 bg-[linear-gradient(180deg,#e5ddd5_0%,#ece5dd_100%)] px-3 py-3">
          <div className="max-w-[85%] self-start rounded-2xl rounded-tl-sm bg-canvas px-2.5 py-2 shadow-sm">
            <p className="text-[11px] leading-4 text-ink">{copy.customerMsg}</p>
          </div>
          <div className="max-w-[90%] self-end rounded-2xl rounded-tr-sm bg-[#DCF8C6] px-2.5 py-2 shadow-sm">
            <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-positive/15 px-1.5 py-0.5 text-[9px] font-semibold text-positive-deep">
              <Bot className="size-2.5" aria-hidden />
              {copy.aiBadge}
            </span>
            <p className="text-[11px] leading-4 text-ink">{copy.aiMsg}</p>
          </div>
        </div>
      </div>

      <Float className="top-[2%] left-0 w-[9.5rem] sm:w-[10.5rem]" delayMs={0} durationSec={6.5}>
        <Chip
          label={chips.ai}
          tone="bg-primary-pale text-positive-deep"
          icon={<Bot className="size-3.5" aria-hidden />}
        />
      </Float>
      <Float className="top-[6%] right-0 w-[10rem] sm:w-[11rem]" delayMs={600} durationSec={7.5}>
        <Chip
          label={chips.broadcast}
          tone="bg-ink text-primary"
          icon={<Megaphone className="size-3.5" aria-hidden />}
        />
      </Float>
      <Float className="top-[38%] left-0 hidden w-[9.75rem] sm:block" delayMs={1100} durationSec={7}>
        <Chip
          label={chips.inbox}
          tone="bg-[#F1F5F9] text-positive-deep"
          icon={<MessagesSquare className="size-3.5" aria-hidden />}
        />
      </Float>
      <Float className="top-[40%] right-0 hidden w-[9.25rem] sm:block" delayMs={1500} durationSec={8}>
        <Chip
          label={chips.analytics}
          tone="bg-primary-pale text-positive-deep"
          icon={<BarChart3 className="size-3.5" aria-hidden />}
        />
      </Float>
      <Float className="bottom-[4%] left-0 w-[10.5rem] sm:bottom-[6%]" delayMs={1900} durationSec={6.8}>
        <Chip
          label={chips.auth}
          tone="bg-primary-pale text-positive-deep"
          icon={<ShieldCheck className="size-3.5" aria-hidden />}
        />
      </Float>
      <Float className="right-0 bottom-[2%] w-[9.5rem] sm:bottom-[4%]" delayMs={2300} durationSec={7.8}>
        <Chip
          label={chips.tenant}
          tone="bg-primary text-on-primary"
          icon={<Building2 className="size-3.5" aria-hidden />}
        />
      </Float>
    </div>
  )
}
