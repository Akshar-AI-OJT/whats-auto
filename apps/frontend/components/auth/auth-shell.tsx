import { Link } from '@/i18n/navigation'
import { Check } from 'lucide-react'

export function AuthShell({
  children,
  panelTitle,
  panelSubtitle,
  panelItems,
}: {
  children: React.ReactNode
  panelTitle: string
  panelSubtitle: string
  /** Optional trust bullets for the right branding panel (desktop). */
  panelItems?: string[]
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left: form column — 8px spacing scale */}
      <div className="flex flex-col bg-canvas px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-10 lg:px-10 lg:py-12">
        <div className="flex shrink-0 justify-center md:justify-start">
          <Link
            href="/"
            className="rounded-sm font-display text-xl leading-none text-ink transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Whats-Auto
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-x-clip py-8 sm:py-10 md:py-12">
          <div className="w-full min-w-0 max-w-[360px] rounded-2xl border border-border bg-canvas-soft p-6 shadow-[0_1px_2px_rgb(14_15_12/0.03),0_6px_20px_rgb(14_15_12/0.05)] sm:p-8">
            {children}
          </div>
        </div>
      </div>

      {/* Right: branding — desktop only */}
      <div className="relative hidden bg-ink lg:block">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-12 py-16 text-center xl:gap-8 xl:px-16">
          <p className="max-w-md font-display-black text-4xl leading-[1.05] text-primary xl:text-5xl">
            {panelTitle}
          </p>
          <p className="max-w-sm text-base leading-6 text-canvas-soft/70">
            {panelSubtitle}
          </p>
          {panelItems && panelItems.length > 0 ? (
            <ul className="mt-2 flex max-w-sm flex-col gap-3 text-left">
              {panelItems.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-sm leading-5 text-canvas-soft/80"
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="size-3 stroke-[2.5]" aria-hidden />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  )
}
