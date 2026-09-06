'use client'

import { useId, useRef, useState } from 'react'
import { ArrowLeft, Loader2, Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup } from '@/components/ui/field'
import {
  authOutlineButtonClassName,
  authPrimaryButtonClassName,
} from '@/components/auth/auth-field-styles'
import {
  completePlanCheckout,
  isFreeActivatablePlan,
  isPlanSelfServe,
} from '@/components/dashboard/billing/billing-utils'
import { useRouter } from '@/i18n/navigation'
import { type ApiError } from '@/lib/api'
import {
  ONBOARDING_PAYMENT_PATH,
  saveOnboardingCheckoutSession,
  savePendingOrganizationPlan,
} from '@/lib/onboarding'
import { cn } from '@/lib/utils'
import { OrganizationOnboardingLayout } from './OrganizationOnboardingLayout'
import {
  SubscriptionPlanSelectionStep,
  type OnboardingPlanSelection,
} from './SubscriptionPlanSelectionStep'

/**
 * Post-setup onboarding plan selection — reuses the existing Step 4 UI,
 * then continues to `/onboarding/payment` (paid) or activates free plans.
 */
export function OnboardingPlanSelectionPage() {
  const t = useTranslations('onboarding.organization')
  const router = useRouter()
  const formErrorId = useId()
  const [selectedPlan, setSelectedPlan] = useState<OnboardingPlanSelection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const lockRef = useRef(false)

  const selectedPlanIsFree = selectedPlan ? isFreeActivatablePlan(selectedPlan) : false
  const canActivateSelectedPlan = selectedPlan ? isPlanSelfServe(selectedPlan) : false
  const ctaLabel = pending
    ? selectedPlanIsFree
      ? t('startingFreeTrial')
      : t('proceedToCheckout')
    : selectedPlanIsFree
      ? t('startFreeTrial')
      : t('proceedToCheckout')
  const hint = selectedPlanIsFree ? t('freeTrialHint') : t('checkoutHint')

  async function handleContinue() {
    if (pending || lockRef.current) return
    if (!selectedPlan) {
      setError(t('errors.planRequired'))
      return
    }
    if (!isPlanSelfServe(selectedPlan)) {
      setError(t('errors.planNotActivatable'))
      return
    }

    lockRef.current = true
    setPending(true)
    setError(null)

    try {
      savePendingOrganizationPlan(selectedPlan.id)

      if (isFreeActivatablePlan(selectedPlan)) {
        await completePlanCheckout(selectedPlan.id)
        router.replace('/dashboard')
        return
      }

      saveOnboardingCheckoutSession({
        planId: selectedPlan.id,
        checkoutPlanId: selectedPlan.id,
        planName: selectedPlan.name,
      })
      router.replace(ONBOARDING_PAYMENT_PATH)
    } catch (err) {
      lockRef.current = false
      const apiError = err as ApiError
      if (apiError.status === 401) {
        setError(t('errors.sessionExpired'))
        router.replace('/login')
        return
      }
      setError(
        apiError.message ||
          (selectedPlanIsFree ? t('errors.activationFailed') : t('errors.checkoutFailed'))
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <OrganizationOnboardingLayout variant="plan" currentStep={4} wideForm>
      <form
        className="flex w-full min-w-0 flex-col"
        onSubmit={(event) => {
          event.preventDefault()
          void handleContinue()
        }}
        noValidate
        aria-busy={pending}
        aria-describedby={error ? formErrorId : undefined}
      >
        <FieldGroup className="gap-8">
          <div className="flex flex-col gap-4 text-left">
            <p className="text-xs font-semibold tracking-wide text-positive-deep uppercase">
              {t('eyebrow', { step: 4, total: 4 })}
            </p>
          </div>

          <SubscriptionPlanSelectionStep
            selectedPlanId={selectedPlan?.id ?? null}
            pending={pending}
            onSelect={(plan) => {
              setSelectedPlan(plan)
              setError(null)
            }}
          />

          {error ? (
            <FieldError id={formErrorId} className="text-sm text-negative">
              {error}
            </FieldError>
          ) : null}

          <Field className="gap-0">
            <div className="flex flex-col gap-3 border-t border-[#CBD5E1] pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <p className="text-sm leading-5 text-mute">{hint}</p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  className={cn(authOutlineButtonClassName, 'sm:w-auto sm:min-w-[7.5rem]')}
                  onClick={() => {
                    setError(null)
                    router.replace('/dashboard')
                  }}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  {t('back')}
                </Button>
                <Button
                  type="submit"
                  disabled={pending || !canActivateSelectedPlan}
                  aria-busy={pending}
                  className={cn(authPrimaryButtonClassName, 'sm:min-w-[14.5rem]')}
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      <span>{ctaLabel}</span>
                    </>
                  ) : (
                    <>
                      {!selectedPlanIsFree ? <Lock className="size-4" aria-hidden /> : null}
                      <span>{ctaLabel}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Field>
        </FieldGroup>
      </form>
    </OrganizationOnboardingLayout>
  )
}
