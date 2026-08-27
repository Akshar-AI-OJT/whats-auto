import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'w-full min-w-0 rounded-md border border-ink bg-canvas px-4 py-3 text-base leading-5 text-ink shadow-none transition-[color,background-color,border-color,box-shadow] outline-none',
        'placeholder:text-mute',
        'hover:border-body',
        'focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-0',
        'disabled:cursor-not-allowed disabled:border-border disabled:bg-canvas-soft disabled:text-mute disabled:opacity-100',
        'aria-invalid:border-negative aria-invalid:hover:border-negative aria-invalid:ring-2 aria-invalid:ring-negative/20',
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
