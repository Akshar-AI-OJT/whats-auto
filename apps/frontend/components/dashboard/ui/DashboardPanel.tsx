import { cn } from '@/lib/utils'

type DashboardPanelProps = {
  children: React.ReactNode
  className?: string
  as?: 'div' | 'section' | 'article'
  id?: string
}

/** Shared glass panel used across dashboard modules. */
export function DashboardPanel({
  children,
  className,
  as: Comp = 'div',
  id,
}: DashboardPanelProps) {
  return (
    <Comp
      id={id}
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
