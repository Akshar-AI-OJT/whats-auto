'use client'

import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AuthPasswordToggle({
  show,
  disabled,
  labelShow,
  labelHide,
  controls,
  onToggle,
}: {
  show: boolean
  disabled?: boolean
  labelShow: string
  labelHide: string
  controls: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-label={show ? labelHide : labelShow}
      aria-controls={controls}
      aria-pressed={show}
      className={cn(
        'absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-mute',
        'transition-colors',
        'hover:bg-canvas-soft hover:text-ink',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        'active:bg-border/60',
        'disabled:pointer-events-none disabled:opacity-50'
      )}
    >
      {show ? (
        <EyeOff className="size-4" aria-hidden />
      ) : (
        <Eye className="size-4" aria-hidden />
      )}
    </button>
  )
}
