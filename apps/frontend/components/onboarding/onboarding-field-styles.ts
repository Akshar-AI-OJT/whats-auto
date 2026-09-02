import { cn } from '@/lib/utils'

/**
 * Visible bordered controls for organization onboarding.
 * Always include border width — native selects with appearance-none have none
 * unless it is set explicitly.
 */
export const onboardingControlClassName = cn(
  'h-12 w-full min-w-0 rounded-xl border border-[#CBD5E1] bg-canvas px-3.5 text-base leading-5 text-ink shadow-none outline-none sm:text-sm',
  'placeholder:text-mute',
  'transition-[color,background-color,border-color,box-shadow] duration-150',
  'hover:border-[#94A3B8] hover:bg-canvas',
  'focus-visible:border-primary focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-primary/25',
  'disabled:cursor-not-allowed disabled:border-[#E2E8F0] disabled:bg-[#F8FAFC] disabled:text-mute disabled:opacity-100',
  'aria-invalid:border-negative aria-invalid:hover:border-negative aria-invalid:ring-2 aria-invalid:ring-negative/20 aria-invalid:focus-visible:ring-negative/25'
)

export const onboardingInputClassName = onboardingControlClassName

export const onboardingInputWithIconClassName = cn(onboardingControlClassName, 'pl-11')

export const onboardingSelectClassName = cn(
  onboardingControlClassName,
  'cursor-pointer appearance-none bg-none pr-10 [&::-ms-expand]:hidden'
)

export const onboardingSelectWithIconClassName = cn(onboardingSelectClassName, 'pl-11')

export const onboardingTextareaClassName = cn(
  onboardingControlClassName,
  'h-auto min-h-[6.75rem] resize-y py-3 leading-6'
)

export const onboardingFieldClassName = 'gap-2.5'

export const onboardingFieldLabelClassName = 'text-sm font-medium leading-5 text-ink'
