'use client'

import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  onboardingSelectClassName,
  onboardingSelectWithIconClassName,
} from './onboarding-field-styles'

type OnboardingSelectProps = React.ComponentProps<'select'> & {
  icon?: LucideIcon
}

export function OnboardingSelect({
  icon: Icon,
  className,
  children,
  ...props
}: OnboardingSelectProps) {
  return (
    <div className="relative">
      {Icon ? (
        <Icon
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
          aria-hidden
        />
      ) : null}
      <select
        className={cn(
          Icon ? onboardingSelectWithIconClassName : onboardingSelectClassName,
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-mute"
        aria-hidden
      />
    </div>
  )
}
