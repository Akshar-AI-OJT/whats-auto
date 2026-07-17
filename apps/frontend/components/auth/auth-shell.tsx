import { Link } from '@/i18n/navigation'

export function AuthShell({
  children,
  panelTitle,
  panelSubtitle,
}: {
  children: React.ReactNode
  panelTitle: string
  panelSubtitle: string
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 bg-canvas p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="font-display text-xl text-ink">
            Whats-Auto
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm rounded-xl bg-canvas-soft p-6 md:p-8">
            {children}
          </div>
        </div>
      </div>
      <div className="relative hidden bg-ink lg:block">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-12 text-center">
          <p className="font-display-black text-4xl text-primary xl:text-5xl">
            {panelTitle}
          </p>
          <p className="max-w-sm text-base text-canvas-soft/70">{panelSubtitle}</p>
        </div>
      </div>
    </div>
  )
}
