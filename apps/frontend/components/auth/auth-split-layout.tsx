import { AppLogo } from '@/components/branding/AppLogo'
import { cn } from '@/lib/utils'

/**
 * Shared auth chrome for Login / Register / Forgot / Reset / Onboarding.
 *
 * Mobile: full-bleed white form (no floating card gutters).
 * Desktop (lg+): elevated split card with branding panel.
 */
export function AuthSplitLayout({
  branding,
  children,
  className,
  compact = false,
  contentClassName,
  wideForm = false,
}: {
  branding: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Tighter padding for tall forms (register). */
  compact?: boolean
  contentClassName?: string
  wideForm?: boolean
}) {
  return (
    <div
      className={cn(
        'auth-palette relative w-full shrink-0 bg-canvas',
        // Fill the phone viewport; content starts at the top (no floating island).
        'min-h-dvh',
        // Soft page chrome + centered card only on large screens.
        'lg:flex lg:justify-center lg:bg-[#F8FAFC] lg:px-8 lg:py-8',
        'xl:items-center xl:py-10',
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden bg-[#F8FAFC] lg:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/3 hidden size-[28rem] -translate-x-1/2 rounded-full bg-slate-200/40 blur-[110px] lg:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 hidden size-[24rem] translate-x-1/5 rounded-full bg-slate-100 blur-[100px] lg:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-1/4 left-0 hidden size-[18rem] rounded-full bg-primary/[0.06] blur-[90px] lg:block"
      />

      <div
        className={cn(
          'relative z-10 mx-auto flex w-full flex-col',
          wideForm ? 'max-w-[1320px]' : 'max-w-[1200px]'
        )}
      >
        <div
          className={cn(
            'flex w-full flex-col bg-canvas',
            // Card chrome only from lg — phones stay flush with the screen.
            'lg:overflow-hidden lg:rounded-[28px] lg:border lg:border-[#E2E8F0]',
            'lg:shadow-[0_1px_2px_rgb(15_23_42/0.04),0_20px_50px_rgb(15_23_42/0.08)]',
            compact ? 'lg:min-h-0 lg:flex-row' : 'lg:flex-row xl:min-h-[680px]'
          )}
        >
          {branding}

          <div className="flex w-full min-w-0 flex-1 flex-col bg-canvas lg:w-[60%]">
            <div
              className={cn(
                'flex flex-1 flex-col justify-start',
                // Safe top inset + comfortable side padding; no wasted gray band.
                'px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.75rem,env(safe-area-inset-bottom))]',
                'sm:px-8 sm:pt-8 sm:pb-10',
                compact
                  ? 'lg:justify-center lg:px-8 lg:py-6 xl:px-10'
                  : wideForm
                    ? 'lg:px-8 lg:py-10 xl:px-10'
                    : 'lg:justify-center lg:px-10 lg:py-12 xl:px-14'
              )}
            >
              <div className={cn('mx-auto w-full min-w-0 max-w-[432px]', contentClassName)}>
                <div className="mb-6 lg:hidden">
                  <AppLogo size="sm" href="/" />
                </div>
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
