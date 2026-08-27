'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { api, type ApiError, type BillingSubscription } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { AuthBranding } from '@/components/auth/auth-branding'
import { AuthLayout } from '@/components/auth/auth-layout'
import {
  isCapturedPayment,
  isFailedPayment,
  isSubscriptionNotFound,
  startBillingPayment,
  unwrapBillingSubscription,
} from '@/components/dashboard/billing/billing-utils'
import { useRouter } from '@/i18n/navigation'
import {
  clearOnboardingCheckoutSession,
  readOnboardingCheckoutSession,
  readPendingWorkspacePlan,
  ORG_SETUP_PATH,
  type OnboardingCheckoutSession,
} from '@/lib/onboarding'
import { ORG_PROFILE_PATH } from '@/lib/organization-profile'
import { OnboardingPaymentView, type OnboardingPaymentViewState } from './OnboardingPaymentView'

function viewFromSubscription(
  subscription: BillingSubscription | null
): OnboardingPaymentViewState {
  if (isCapturedPayment(subscription)) return 'success'
  if (isFailedPayment(subscription)) return 'failed'
  return 'pending'
}

function readCheckoutSession(): OnboardingCheckoutSession | null {
  const stored = readOnboardingCheckoutSession()
  if (stored) return stored
  const pendingPlan = readPendingWorkspacePlan()
  if (!pendingPlan) return null
  return {
    planId: pendingPlan,
    checkoutPlanId: pendingPlan,
  }
}

function subscribeCheckoutSession() {
  return () => {}
}

export function OnboardingPaymentPage() {
  const t = useTranslations('onboarding.organization')
  const router = useRouter()
  const session = useSyncExternalStore(
    subscribeCheckoutSession,
    readCheckoutSession,
    () => null
  )
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  useEffect(() => {
    if (session === null) {
      router.replace(ORG_SETUP_PATH)
    }
  }, [session, router])

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.onboarding.billingSubscription,
    enabled: session !== null,
    queryFn: async (): Promise<BillingSubscription | null> => {
      try {
        const { data } = await api.billing.getSubscription()
        return unwrapBillingSubscription(data)
      } catch (error) {
        if (isSubscriptionNotFound(error)) return null
        throw error
      }
    },
  })

  const view = viewFromSubscription(subscriptionQuery.data ?? null)
  const planName = session?.planName ?? ''
  const planId = session?.planId ?? session?.checkoutPlanId ?? null

  async function handleCompletePayment() {
    if (!planId || paying) return
    setPaying(true)
    setPayError(null)
    try {
      await startBillingPayment(planId)
      await subscriptionQuery.refetch()
    } catch (error) {
      const apiError = error as ApiError
      setPayError(apiError.message || t('errors.checkoutFailed'))
    } finally {
      setPaying(false)
    }
  }

  function handleContinueToDashboard() {
    clearOnboardingCheckoutSession()
    router.push(ORG_PROFILE_PATH)
  }

  if (!session) {
    return (
      <AuthLayout branding={<AuthBranding variant="organization" />}>
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-body">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('payment.redirectingTitle')}
        </div>
      </AuthLayout>
    )
  }

  const queryError = subscriptionQuery.isError
    ? (subscriptionQuery.error as unknown as ApiError)?.message || t('errors.checkoutFailed')
    : null

  return (
    <AuthLayout branding={<AuthBranding variant="organization" />}>
      <OnboardingPaymentView
        state={view}
        planName={planName}
        error={payError || queryError}
        completePaymentDisabled={!planId || paying}
        refreshDisabled={subscriptionQuery.isFetching || paying}
        onContinueToDashboard={handleContinueToDashboard}
        onCompletePayment={() => {
          void handleCompletePayment()
        }}
        onRefresh={() => {
          void subscriptionQuery.refetch()
        }}
      />
    </AuthLayout>
  )
}
