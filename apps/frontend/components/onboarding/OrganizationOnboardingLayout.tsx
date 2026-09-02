import { cn } from '@/lib/utils'
import { OrganizationOnboardingSidebar } from './OrganizationOnboardingSidebar'
import type { OrgWizardStep } from './organization-wizard-types'

/**
 * Two-column organization onboarding shell.
 * Presentation only — step state is passed in from the wizard.
 */
export function OrganizationOnboardingLayout({
  currentStep,
  children,
  className,
  contentClassName,
  wideForm = false,
}: {
  currentStep: OrgWizardStep
  children: React.ReactNode
  className?: string
  contentClassName?: string
  wideForm?: boolean
}) {
  return (
    <div
      className={cn(
        'auth-palette min-h-svh w-full overflow-x-clip bg-[#F8FAFC]',
        'px-3 py-3 sm:px-4 sm:py-4 md:px-5 md:py-5',
        className
      )}
    >
      <div
        className={cn(
          'relative mx-auto flex w-full max-w-[1440px] flex-col',
          'rounded-[24px] border border-[#E2E8F0] bg-canvas',
          'shadow-[0_1px_2px_rgb(15_23_42/0.04),0_16px_40px_rgb(15_23_42/0.06)]',
          'md:flex-row md:items-start'
        )}
      >
        <OrganizationOnboardingSidebar currentStep={currentStep} />

        <div className="min-w-0 w-full flex-1 bg-canvas">
          <div
            className={cn(
              'px-5 py-6 sm:px-7 sm:py-7 md:px-8 md:py-8',
              wideForm ? 'lg:px-9' : 'lg:px-10'
            )}
          >
            <div className={cn('w-full min-w-0', contentClassName)}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
