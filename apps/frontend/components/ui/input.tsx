import * as React from 'react'
import { Input as InputPrimitive } from '@base-ui/react/input'

import { cn } from '@/lib/utils'

/** Wise text-input: white fill, ink border, rounded-md (12px). */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-12 w-full min-w-0 rounded-md border border-ink bg-canvas px-4 py-3 text-base text-ink transition-[color,box-shadow] outline-none',
        'placeholder:text-mute',
        'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-negative aria-invalid:ring-2 aria-invalid:ring-negative/20',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink',
        className
      )}
      {...props}
    />
  )
}

export { Input }
