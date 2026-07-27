import { FeaturesAurora } from '@/components/features/page/FeaturesAurora'
import { cn } from '@/lib/utils'

/** Shared layout for Privacy / Terms body: sticky nav + content column. */
export function LegalBodyLayout({
  nav,
  children,
  className,
}: {
  nav: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative bg-[#F8FAFC] py-10 sm:py-14 md:py-16',
        className
      )}
    >
      {/* Clip aurora bleed without creating an overflow ancestor for sticky nav */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-x-clip"
      >
        <FeaturesAurora />
      </div>
      <div className="relative z-10 mx-auto grid max-w-[1200px] gap-6 px-4 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[280px_minmax(0,820px)] xl:justify-center">
        {nav}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
