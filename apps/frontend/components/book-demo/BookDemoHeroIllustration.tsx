import { Bot, Calendar, Clock3, Video } from 'lucide-react'
import { SiGooglemeet } from 'react-icons/si'
import { cn } from '@/lib/utils'
import { authFloatingCardClassName } from '@/components/auth/auth-field-styles'

function Float({
  className,
  delayMs,
  durationSec = 7.5,
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

export type BookDemoHeroIllustrationCopy = {
  label: string
  title: string
  subtitle: string
  meetLabel: string
  duration: string
  aiChip: string
  calendarChip: string
  meetChip: string
}

/** Premium glass demo illustration — no fake analytics. */
export function BookDemoHeroIllustration({
  copy,
}: {
  copy: BookDemoHeroIllustrationCopy
}) {
  return (
    <div
      className="relative mx-auto h-[400px] w-full max-w-[420px] sm:h-[440px] sm:max-w-[460px] lg:mx-0 lg:max-w-none"
      role="img"
      aria-label={copy.label}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/16 blur-[100px] sm:size-[300px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[8%] right-[4%] size-[120px] rounded-full bg-primary-pale/70 blur-[70px]"
      />

      {/* Main glass card */}
      <div
        className={cn(
          'absolute top-1/2 left-1/2 z-20 w-[min(100%,280px)] -translate-x-1/2 -translate-y-1/2 sm:w-[300px]',
          'overflow-hidden rounded-[28px] border border-[#E2E8F0]/90 bg-canvas/80 backdrop-blur-md',
          'shadow-[0_24px_60px_rgb(15_23_42/0.12),0_4px_12px_rgb(15_23_42/0.06)]'
        )}
      >
        <div className="relative border-b border-[#E2E8F0] bg-gradient-to-br from-primary-pale/80 via-canvas to-canvas px-5 py-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-8 -right-6 size-28 rounded-full bg-primary/25 blur-2xl"
          />
          <div className="relative flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-[0_8px_20px_rgb(37_99_235/0.4)]">
              <Calendar className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-base font-semibold tracking-tight text-ink">
                {copy.title}
              </p>
              <p className="mt-0.5 text-xs font-medium text-mute">{copy.subtitle}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-canvas text-[#2563eb]">
              <SiGooglemeet className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink">{copy.meetLabel}</p>
              <p className="text-[10px] font-medium text-mute">{copy.duration}</p>
            </div>
            <Video className="ml-auto size-4 text-mute" aria-hidden />
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-canvas px-3 py-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary-pale text-positive-deep">
              <Bot className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink">{copy.aiChip}</p>
              <p className="text-[10px] font-medium text-mute">Whats-Auto</p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-positive/15 px-2 py-0.5 text-[9px] font-semibold text-positive-deep">
              <span className="size-1.5 rounded-full bg-positive" aria-hidden />
              Live
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-primary-pale/50 px-3 py-2 text-[11px] font-medium text-positive-deep">
            <Clock3 className="size-3.5 shrink-0" aria-hidden />
            {copy.duration}
          </div>
        </div>
      </div>

      <Float className="top-[4%] left-0 w-[9.75rem] sm:left-[2%]" delayMs={0} durationSec={7}>
        <div
          className={cn(
            authFloatingCardClassName,
            'flex items-center gap-2.5 rounded-xl p-2.5'
          )}
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary-pale text-positive-deep">
            <Calendar className="size-3.5" aria-hidden />
          </span>
          <p className="truncate text-[11px] font-semibold text-ink sm:text-xs">
            {copy.calendarChip}
          </p>
        </div>
      </Float>

      <Float
        className="top-[10%] right-0 w-[9.5rem] sm:right-[2%]"
        delayMs={700}
        durationSec={8}
      >
        <div
          className={cn(
            authFloatingCardClassName,
            'flex items-center gap-2.5 rounded-xl p-2.5'
          )}
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-canvas text-[#2563eb] shadow-inner">
            <SiGooglemeet className="size-3.5" aria-hidden />
          </span>
          <p className="truncate text-[11px] font-semibold text-ink sm:text-xs">
            {copy.meetChip}
          </p>
        </div>
      </Float>

      <Float
        className="bottom-[6%] left-[4%] w-[10rem] sm:bottom-[8%]"
        delayMs={1400}
        durationSec={7.5}
      >
        <div
          className={cn(
            authFloatingCardClassName,
            'flex items-center gap-2.5 rounded-xl p-2.5'
          )}
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
            <Bot className="size-3.5" aria-hidden />
          </span>
          <p className="truncate text-[11px] font-semibold text-ink sm:text-xs">
            {copy.aiChip}
          </p>
        </div>
      </Float>
    </div>
  )
}
