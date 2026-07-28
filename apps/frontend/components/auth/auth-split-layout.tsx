import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * Shared premium auth chrome used by Login + Register.
 * Logo above card; 40% branding / 60% form.
 */
export function AuthSplitLayout({
  branding,
  children,
  className,
}: {
  branding: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative flex min-h-svh w-full items-center justify-center overflow-x-clip px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-10',
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

      <div className="relative z-10 flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6">
        <Link
          href="/"
          className="w-fit font-display text-xl leading-none text-ink transition-opacity hover:opacity-80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8FAFC] sm:text-[1.35rem]"
        >
          Whats-Auto
        </Link>

        <div
          className={cn(
            'flex w-full flex-col overflow-hidden',
            'rounded-[28px] border border-[#E2E8F0] bg-canvas',
            'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_20px_50px_rgb(15_23_42/0.08)]',
            'md:min-h-[700px] md:flex-row'
          )}
        >
          {branding}

          <div className="flex w-full min-w-0 flex-1 flex-col bg-canvas md:w-[60%]">
            <div className="flex flex-1 flex-col justify-center overflow-x-clip px-5 py-10 sm:px-8 sm:py-12 md:px-10 md:py-14 lg:px-14">
              <div className="mx-auto w-full min-w-0 max-w-[400px]">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
