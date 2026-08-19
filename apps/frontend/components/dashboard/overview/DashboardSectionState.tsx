'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function PanelLoading({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        'mt-5 flex min-h-48 flex-1 items-center justify-center text-sm text-mute',
        className
      )}
    >
      {label}
    </div>
  )
}

export function PanelError({
  label,
  retryLabel,
  retry,
  className,
}: {
  label: string
  retryLabel: string
  retry: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'mt-5 flex min-h-48 flex-1 flex-col items-center justify-center gap-3 px-4 text-center',
        className
      )}
    >
      <p className="text-sm text-body">{label}</p>
      <Button type="button" variant="outline" size="sm" onClick={retry}>
        {retryLabel}
      </Button>
    </div>
  )
}
