import { ArrowRight, Bot, GitBranch, MessageCircle, Zap } from 'lucide-react'
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

export type AboutHeroIllustrationCopy = {
  label: string
  businessName: string
  businessStatus: string
  todayLabel: string
  customerMessage: string
  aiLabel: string
  aiReply: string
  timeCustomer: string
  timeAi: string
  aiChip: string
  aiChipStatus: string
  nodeTrigger: string
  nodeAi: string
  nodeReply: string
  workflowLabel: string
}

/** Abstract SaaS illustration — chat + AI + workflow. No analytics. */
export function AboutHeroIllustration({
  copy,
}: {
  copy: AboutHeroIllustrationCopy
}) {
  return (
    <div
      className="relative mx-auto h-[420px] w-full max-w-[440px] sm:h-[460px] sm:max-w-[480px] lg:mx-0 lg:max-w-none"
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
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[12%] left-[6%] size-[100px] rounded-full bg-primary/10 blur-[60px]"
      />

      {/* Center WhatsApp-inspired phone */}
      <div className="absolute top-1/2 left-1/2 z-20 w-[196px] -translate-x-1/2 -translate-y-1/2 sm:w-[216px]">
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

            <div className="flex min-h-[250px] flex-col gap-2.5 bg-[linear-gradient(180deg,#e5ddd5_0%,#ece5dd_40%,#e8e0d5_100%)] px-2.5 py-3 sm:min-h-[280px]">
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
                  <p className="text-[11px] leading-4 text-ink sm:text-xs sm:leading-5">
                    {copy.aiReply}
                  </p>
                  <p className="mt-1 text-right text-[9px] text-mute">{copy.timeAi}</p>
                </div>
              </div>

              <div className="mt-auto flex items-center gap-1.5 self-center rounded-full border border-primary/30 bg-canvas/95 px-2.5 py-1 text-[9px] font-semibold text-positive-deep shadow-sm">
                <Zap className="size-2.5" aria-hidden />
                {copy.workflowLabel}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Assistant float */}
      <Float className="top-[2%] left-0 w-[10.5rem] sm:left-[2%]" delayMs={0} durationSec={7}>
        <div
          className={cn(
            authFloatingCardClassName,
            'flex items-center gap-2.5 rounded-xl p-2.5'
          )}
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary shadow-[0_4px_12px_rgb(37_99_235/0.35)]">
            <Bot className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-ink sm:text-xs">
              {copy.aiChip}
            </p>
            <p className="truncate text-[10px] font-medium text-mute">
              {copy.aiChipStatus}
            </p>
          </div>
        </div>
      </Float>

      {/* Chat bubble float */}
      <Float
        className="top-[8%] right-0 w-[9.75rem] sm:right-[1%]"
        delayMs={600}
        durationSec={8}
      >
        <div
          className={cn(
            authFloatingCardClassName,
            'flex items-center gap-2.5 rounded-xl p-2.5'
          )}
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-[#DCF8C6] text-[#075E54]">
            <MessageCircle className="size-3.5" aria-hidden />
          </span>
          <p className="truncate text-[11px] font-semibold text-ink sm:text-xs">
            {copy.aiLabel}
          </p>
        </div>
      </Float>

      {/* Workflow nodes + automation arrows */}
      <Float
        className="bottom-[4%] left-1/2 w-[min(100%,18rem)] -translate-x-1/2 sm:bottom-[6%] sm:w-[19rem]"
        delayMs={1100}
        durationSec={7.5}
      >
        <div
          className={cn(
            authFloatingCardClassName,
            'rounded-2xl px-3 py-3 sm:px-3.5'
          )}
        >
          <div className="mb-2 flex items-center gap-1.5 px-0.5">
            <GitBranch className="size-3 text-positive-deep" aria-hidden />
            <p className="text-[10px] font-semibold tracking-wide text-mute uppercase">
              {copy.workflowLabel}
            </p>
          </div>
          <div className="flex items-center justify-between gap-1">
            <WorkflowNode label={copy.nodeTrigger} tone="slate" />
            <ArrowRight
              className="size-3.5 shrink-0 text-primary"
              strokeWidth={2.5}
              aria-hidden
            />
            <WorkflowNode label={copy.nodeAi} tone="green" />
            <ArrowRight
              className="size-3.5 shrink-0 text-primary"
              strokeWidth={2.5}
              aria-hidden
            />
            <WorkflowNode label={copy.nodeReply} tone="mint" />
          </div>
        </div>
      </Float>
    </div>
  )
}

function WorkflowNode({
  label,
  tone,
}: {
  label: string
  tone: 'slate' | 'green' | 'mint'
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border px-1.5 py-2 text-center',
        tone === 'slate' && 'border-[#E2E8F0] bg-[#F8FAFC]',
        tone === 'green' && 'border-primary/40 bg-primary-pale',
        tone === 'mint' && 'border-[#DCF8C6] bg-[#DCF8C6]/70'
      )}
    >
      <span
        className={cn(
          'size-2 rounded-full',
          tone === 'slate' && 'bg-mute',
          tone === 'green' && 'bg-primary shadow-[0_0_0_3px_rgb(37_99_235/0.35)]',
          tone === 'mint' && 'bg-[#2563eb]'
        )}
        aria-hidden
      />
      <p className="truncate text-[9px] font-semibold text-ink sm:text-[10px]">
        {label}
      </p>
    </div>
  )
}
