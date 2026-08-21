import { cn } from '@/lib/utils'

/** White auth inputs with subtle gray borders. */
export const authInputClassName = cn(
  'border-[#E2E8F0] bg-canvas',
  'hover:border-[#CBD5E1] hover:bg-canvas',
  'focus-visible:border-primary focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-primary/25'
)

export const authInputWithIconClassName = cn(authInputClassName, 'pl-11')

/** Primary CTA — brand blue accent on the action itself. */
export const authPrimaryButtonClassName = cn(
  'w-full border-transparent text-on-primary',
  'bg-gradient-to-b from-primary-active to-primary',
  'shadow-[0_1px_2px_rgb(14_15_12/0.06),0_8px_18px_rgb(37_99_235/0.28)]',
  'transition-[transform,box-shadow,background] duration-200',
  'hover:-translate-y-px hover:from-primary hover:to-primary-neutral',
  'hover:shadow-[0_2px_4px_rgb(14_15_12/0.06),0_12px_24px_rgb(37_99_235/0.32)]',
  'active:translate-y-0 active:shadow-[0_1px_2px_rgb(14_15_12/0.06),0_6px_12px_rgb(37_99_235/0.22)]',
  'focus-visible:ring-primary/40'
)

export const authOutlineButtonClassName = cn(
  'w-full border-[#E2E8F0] bg-canvas hover:border-[#CBD5E1] hover:bg-[#F8FAFC] hover:shadow-sm',
  'active:bg-[#F1F5F9] focus-visible:ring-primary/40'
)

export const authDividerClassName =
  'my-0 h-auto py-1 text-xs [&_[data-slot=field-separator-content]]:bg-canvas [&_[data-slot=field-separator-content]]:px-3 [&_[data-slot=field-separator-content]]:text-xs [&_[data-slot=field-separator-content]]:leading-4 [&_[data-slot=field-separator-content]]:font-medium [&_[data-slot=field-separator-content]]:text-mute'

/** White floating cards — blue accents nest inside when needed. */
export const authFloatingCardClassName =
  'rounded-2xl border border-[#E2E8F0] bg-canvas shadow-[0_12px_40px_rgb(15_23_42/0.08),0_2px_6px_rgb(15_23_42/0.04)]'

export const authFloatingChipClassName =
  'rounded-xl border border-[#E2E8F0] bg-canvas shadow-[0_12px_28px_rgb(15_23_42/0.08),0_2px_4px_rgb(15_23_42/0.04)]'
