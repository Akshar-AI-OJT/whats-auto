import { cn } from '@/lib/utils'

/**
 * Shared premium auth chrome used by Login + Register.
 * 40% branding / 60% form (wider form optional for plan selection).
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
  /** Tighter padding for tall forms (register) so primary CTAs fit without scroll. */
  compact?: boolean
  /** Optional override for the form column inner max-width (e.g. wider plan picker). */
  contentClassName?: string
  /** Gives the form column more horizontal room (plan selection). */
  wideForm?: boolean
}) {
  return (
    <div
      className={cn(
        'auth-palette relative flex min-h-svh w-full items-center justify-center overflow-x-clip px-4 sm:px-6 md:px-8',
        compact ? 'py-4 sm:py-5 md:py-6' : 'py-6 sm:py-8 md:py-10',
        className
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#F8FAFC]" />
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/3 size-[28rem] -translate-x-1/2 rounded-full bg-slate-200/40 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 size-[24rem] translate-x-1/5 rounded-full bg-slate-100 blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-1/4 left-0 size-[18rem] rounded-full bg-primary/[0.06] blur-[90px]"
      />

      <div
        className={cn(
          'relative z-10 flex w-full flex-col',
          wideForm ? 'max-w-[1320px]' : 'max-w-[1200px]',
          compact ? 'gap-3 sm:gap-4' : 'gap-5 sm:gap-6'
        )}
      >
        <div
          className={cn(
            'flex w-full flex-col overflow-hidden',
            'rounded-[28px] border border-[#E2E8F0] bg-canvas',
            'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_20px_50px_rgb(15_23_42/0.08)]',
            compact ? 'md:min-h-0 md:flex-row' : 'md:min-h-[700px] md:flex-row'
          )}
        >
          {branding}

          <div className="flex w-full min-w-0 flex-1 flex-col bg-canvas md:w-[60%]">
            <div
              className={cn(
                'flex flex-1 flex-col overflow-x-clip',
                compact
                  ? 'justify-start px-5 py-5 sm:px-7 sm:py-6 md:justify-center md:px-8 md:py-6 lg:px-10'
                  : wideForm
                    ? 'justify-start px-5 py-8 sm:px-7 sm:py-10 md:px-8 md:py-10 lg:px-10'
                    : 'justify-center px-5 py-10 sm:px-8 sm:py-12 md:px-10 md:py-14 lg:px-14'
              )}
            >
              <div className={cn('mx-auto w-full min-w-0 max-w-[432px]', contentClassName)}>
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
