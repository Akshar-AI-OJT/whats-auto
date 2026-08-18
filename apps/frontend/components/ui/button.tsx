import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Wise button primitives (DESIGN-wise.md):
 * - primary: lime fill + ink text, rounded-xl (24px)
 * - secondary: sage canvas-soft fill
 * - outline/tertiary: white + ink hairline border
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-base font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-2 active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-on-primary hover:bg-primary-active',
        outline:
          'border-ink bg-canvas text-ink hover:bg-canvas-soft aria-expanded:bg-canvas-soft',
        secondary:
          'bg-canvas-soft text-ink hover:bg-primary-pale aria-expanded:bg-primary-pale',
        ghost: 'text-ink hover:bg-canvas-soft aria-expanded:bg-canvas-soft',
        destructive:
          'bg-negative text-canvas hover:bg-negative-deep focus-visible:ring-negative/30',
        link: 'rounded-none text-ink underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-12 gap-2 px-6 py-3',
        xs: 'h-8 gap-1 rounded-lg px-3 text-xs',
        sm: 'h-10 gap-1.5 rounded-xl px-4 text-sm',
        lg: 'h-12 gap-2 px-8 text-base',
        icon: 'size-11 rounded-full',
        'icon-xs': 'size-7 rounded-full [&_svg:not([class*=\'size-\'])]:size-3',
        'icon-sm': 'size-9 rounded-full',
        'icon-lg': 'size-12 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  // Not supported by Base UI Button — strip so it never reaches the DOM.
  asChild: _asChild,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
