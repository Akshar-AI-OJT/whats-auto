'use client'

import { Check, CreditCard, Loader2, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  authOutlineButtonClassName,
  authPrimaryButtonClassName,
} from '@/components/auth/auth-field-styles'
import { cn } from '@/lib/utils'

export type OnboardingPaymentViewState =
  | 'redirecting'
  | 'pending'
  | 'success'
  | 'failed'
  | 'cancelled'

type OnboardingPaymentViewProps = {
  state: OnboardingPaymentViewState
  planName: string
  error?: string | null
  completePaymentDisabled?: boolean
  refreshDisabled?: boolean
  onContinueToDashboard: () => void
  onCompletePayment: () => void
  onRefresh: () => void
}

export function OnboardingPaymentView({
  state,
  planName,
  error,
  completePaymentDisabled,
  refreshDisabled,
  onContinueToDashboard,
  onCompletePayment,
  onRefresh,
}: OnboardingPaymentViewProps) {
  const t = useTranslations('onboarding.organization.payment')

  const title =
    state === 'redirecting'
      ? t('redirectingTitle')
      : state === 'success'
        ? t('successTitle')
        : state === 'failed'
          ? t('failedTitle')
          : state === 'cancelled'
            ? t('cancelledTitle')
            : t('pendingTitle')

  const subtitle =
    state === 'redirecting'
      ? t('redirectingSubtitle')
      : state === 'success'
        ? t('successSubtitle')
        : state === 'failed'
          ? t('failedSubtitle')
          : state === 'cancelled'
            ? t('cancelledSubtitle')
            : t('pendingSubtitle')

  const showCompletePayment = state === 'pending' || state === 'failed' || state === 'cancelled'
  const showRefresh = state === 'pending' || state === 'failed'

  return (
    <div role="status" aria-live="polite" className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex flex-col items-center gap-4 text-center sm:items-start sm:text-left">
        <span
          aria-hidden
          className={cn(
            'flex size-14 items-center justify-center rounded-full',
            state === 'success'
              ? 'bg-primary-pale text-positive-deep'
              : state === 'failed'
                ? 'bg-negative/10 text-negative'
                : 'bg-primary-pale text-positive-deep'
          )}
        >
          {state === 'redirecting' || state === 'pending' ? (
            <Loader2 className="size-6 animate-spin" />
          ) : state === 'success' ? (
            <Check className="size-7 stroke-[2.5]" />
          ) : (
            <CreditCard className="size-6" />
          )}
        </span>

        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[1.5rem] leading-7 tracking-tight text-ink sm:text-[1.75rem] sm:leading-8">
            {title}
          </h1>
          <p className="text-sm leading-6 text-pretty text-body">{subtitle}</p>
        </div>
      </div>

      {planName ? (
        <div className="rounded-2xl border border-dash-border bg-dash-surface/30 p-4 text-left">
          <p className="text-xs font-semibold tracking-wide text-positive-deep uppercase">
            {t('planLabel')}
          </p>
          <p className="mt-2 text-sm font-semibold text-ink">{planName}</p>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-left text-sm leading-5 text-negative"
        >
          {error}
        </div>
      ) : null}

      {state === 'success' ? (
        <Button
          type="button"
          className={authPrimaryButtonClassName}
          onClick={onContinueToDashboard}
        >
          {t('continueToDashboard')}
        </Button>
      ) : null}

      {showCompletePayment || showRefresh ? (
        <div className="flex flex-col gap-2.5 sm:flex-row-reverse">
          {showCompletePayment ? (
            <Button
              type="button"
              disabled={completePaymentDisabled}
              className={cn(authPrimaryButtonClassName, 'sm:flex-1')}
              onClick={onCompletePayment}
            >
              <CreditCard className="size-4" aria-hidden />
              {t('completePayment')}
            </Button>
          ) : null}
          {showRefresh ? (
            <Button
              type="button"
              variant="outline"
              disabled={refreshDisabled}
              className={cn(authOutlineButtonClassName, 'sm:flex-1')}
              onClick={onRefresh}
            >
              <RefreshCw className={cn('size-4', refreshDisabled && 'animate-spin')} aria-hidden />
              {t('refreshStatus')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
