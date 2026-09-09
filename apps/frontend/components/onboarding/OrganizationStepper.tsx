'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OrgWizardStep } from './organization-wizard-types'

type StepMeta = {
  id: OrgWizardStep
  label: string
}

type OrganizationStepperProps = {
  currentStep: OrgWizardStep
  steps: StepMeta[]
  className?: string
}

export function OrganizationStepper({
  currentStep,
  steps,
  className,
}: OrganizationStepperProps) {
  return (
    <nav
      aria-label="Organization setup progress"
      className={cn('w-full', className)}
    >
      <ol className="flex items-start gap-0">
        {steps.map((step, index) => {
          const done = currentStep > step.id
          const active = currentStep === step.id
          const isLast = index === steps.length - 1

          return (
            <li
              key={step.id}
              className={cn('flex min-w-0', isLast ? 'flex-none' : 'flex-1')}
            >
              <div className="flex min-w-0 flex-col items-center gap-2">
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200',
                    done && 'bg-primary text-on-primary',
                    active && !done && 'bg-primary text-on-primary ring-4 ring-primary/20',
                    !done && !active && 'border border-[#E2E8F0] bg-canvas text-mute'
                  )}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? <Check className="size-3.5 stroke-[2.5]" aria-hidden /> : step.id}
                </span>
                <span
                  className={cn(
                    'max-w-[5.5rem] text-center text-[11px] leading-4 font-medium sm:max-w-none sm:text-xs',
                    active && 'text-primary',
                    done && !active && 'text-ink',
                    !done && !active && 'text-mute'
                  )}
                >
                  {step.label}
                </span>
              </div>

              {!isLast ? (
                <div
                  className="mt-4 h-0.5 min-w-[0.75rem] flex-1 rounded-full bg-[#E2E8F0] sm:mx-3"
                  aria-hidden
                >
                  <div
                    className={cn(
                      'h-full rounded-full bg-primary transition-[width] duration-300',
                      done ? 'w-full' : 'w-0'
                    )}
                  />
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
