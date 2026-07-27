import { cn } from '@/lib/utils'

type DashboardPanelProps = {
  children: React.ReactNode
  className?: string
  as?: 'div' | 'section' | 'article'
}

/** Shared glass panel used across dashboard modules. */
export function DashboardPanel({
  children,
  className,
  as: Comp = 'div',
}: DashboardPanelProps) {
  return (
    <Comp
      className={cn(
        'rounded-[24px] border border-dash-border bg-canvas/90 backdrop-blur-sm',
        'dash-elevated-shadow',
        className
      )}
    >
      {children}
    </Comp>
  )
}
