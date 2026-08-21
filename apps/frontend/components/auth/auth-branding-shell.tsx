import { cn } from '@/lib/utils'

/**
 * Shared left-panel atmosphere — soft neutral wash with quiet blue accents.
 */
export function AuthBrandingShell({
  children,
  footer,
  className,
}: {
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <aside
      className={cn(
        'relative flex w-full flex-col justify-between overflow-hidden border-b border-[#E2E8F0] bg-[#FAFBFC] md:w-[40%] md:min-h-full md:border-r md:border-b-0',
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_12%_8%,rgb(37_99_235/0.08),transparent_48%),radial-gradient(ellipse_at_88%_18%,rgb(30_64_175/0.05),transparent_42%),linear-gradient(165deg,#F8FAFC_0%,#FFFFFF_48%,#F1F5F9_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            'radial-gradient(rgb(15_23_42 / 0.06) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
          maskImage:
            'radial-gradient(ellipse at 40% 40%, black 18%, transparent 72%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-primary/[0.08] blur-[80px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -left-28 size-80 rounded-full bg-slate-300/20 blur-[90px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-6 bottom-16 size-48 rounded-full bg-brand/[0.06] blur-[70px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#F8FAFC]/90 to-transparent"
      />

      <div className="relative z-10 flex flex-col gap-6 px-6 py-7 sm:px-8 sm:py-9 md:gap-8 md:px-10 md:py-10 lg:px-12">
        {children}
      </div>

      {footer ? (
        <p className="relative z-10 hidden px-10 pb-10 text-xs leading-5 text-mute md:block lg:px-12">
          {footer}
        </p>
      ) : null}
    </aside>
  )
}
