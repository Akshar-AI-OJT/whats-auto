'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { api, type ApiError, type BillingSubscription } from '@/lib/api'
import { AuthBranding } from '@/components/auth/auth-branding'
import { AuthLayout } from '@/components/auth/auth-layout'
import {
  isCapturedPayment,
  isFailedPayment,
  isSubscriptionNotFound,
  unwrapBillingSubscription,
} from '@/components/dashboard/billing/billing-utils'
import { useRouter } from '@/i18n/navigation'
import {
  clearOnboardingCheckoutSession,
  readOnboardingCheckoutSession,
  saveOnboardingCheckoutSession,
  ORG_SETUP_PATH,
  type OnboardingCheckoutSession,
} from '@/lib/onboarding'
import {
  OnboardingPaymentView,
  type OnboardingPaymentViewState,
} from './OnboardingPaymentView'

function readGatewayReturnParams() {
  if (typeof window === 'undefined') {
    return { success: false, cancelled: false }
  }
  const params = new URLSearchParams(window.location.search)
  const status = (params.get('status') || params.get('payment') || '').toLowerCase()
  const success =
    Boolean(params.get('razorpay_payment_id')) ||
    Boolean(params.get('razorpay_subscription_id')) ||
    status === 'success' ||
    status === 'paid' ||
    status === 'captured'
  const cancelled =
    status === 'cancelled' ||
    status === 'canceled' ||
    Boolean(params.get('error')) ||
    params.get('razorpay_payment_link_status') === 'cancelled'
  return { success, cancelled }
}

function resolveCheckoutSession(
  stored: OnboardingCheckoutSession
): { session: OnboardingCheckoutSession; checkoutUrl: string | null } {
  const gateway = readGatewayReturnParams()
  if (gateway.success) {
    return { session: { ...stored, phase: 'success' }, checkoutUrl: null }
  }
  if (gateway.cancelled && stored.phase !== 'success') {
    return { session: { ...stored, phase: 'cancelled' }, checkoutUrl: null }
  }
  if (stored.phase === 'awaiting_gateway' && stored.checkoutUrl) {
    return {
      session: { ...stored, phase: 'awaiting_return' },
      checkoutUrl: stored.checkoutUrl,
    }
  }
  if (stored.phase === 'awaiting_gateway' && !stored.checkoutUrl) {
    return { session: { ...stored, phase: 'success' }, checkoutUrl: null }
  }
  return { session: stored, checkoutUrl: null }
}

function viewFromSession(
  session: OnboardingCheckoutSession | null,
  subscription: BillingSubscription | null
): OnboardingPaymentViewState {
  if (!session) return 'pending'
  if (isCapturedPayment(subscription) || session.phase === 'success') return 'success'
  if (isFailedPayment(subscription) || session.phase === 'failed') return 'failed'
  if (session.phase === 'cancelled') return 'cancelled'
  if (session.phase === 'awaiting_gateway') return 'redirecting'
  return 'pending'
}

export function OnboardingPaymentPage() {
  const t = useTranslations('onboarding.organization')
  const router = useRouter()
  const [session, setSession] = useState<OnboardingCheckoutSession | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      await Promise.resolve()
      if (cancelled) return

      const stored = readOnboardingCheckoutSession()
      if (!stored) {
        router.replace(ORG_SETUP_PATH)
        return
      }

      const resolved = resolveCheckoutSession(stored)
      saveOnboardingCheckoutSession(resolved.session)
      if (cancelled) return

      if (resolved.checkoutUrl) {
        window.location.assign(resolved.checkoutUrl)
        return
      }

      setSession(resolved.session)
      setReady(true)
    })()

    return () => {
      cancelled = true
    }
  }, [router])

  const subscriptionQuery = useQuery({
    queryKey: ['onboarding', 'billing', 'subscription'],
    enabled: ready,
    queryFn: async (): Promise<BillingSubscription | null> => {
      try {
        const { data } = await api.billing.getSubscription()
        return unwrapBillingSubscription(data)
      } catch (error) {
        if (isSubscriptionNotFound(error)) return null
        throw error
      }
    },
    refetchInterval: (query) => {
      const data = query.state.data ?? null
      if (isCapturedPayment(data) || isFailedPayment(data)) return false
      if (session?.phase === 'success' || session?.phase === 'failed') return false
      return 2500
    },
  })

  const view = viewFromSession(session, subscriptionQuery.data ?? null)
  const planName = session?.planName ?? ''

  function handleCompletePayment() {
    const url = session?.checkoutUrl
    if (!url || typeof window === 'undefined') return
    window.location.assign(url)
  }

  function handleContinueToDashboard() {
    clearOnboardingCheckoutSession()
    router.push('/dashboard')
  }

  if (!ready || !session) {
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
        error={queryError}
        completePaymentDisabled={!session.checkoutUrl}
        refreshDisabled={subscriptionQuery.isFetching}
        onContinueToDashboard={handleContinueToDashboard}
        onCompletePayment={handleCompletePayment}
        onRefresh={() => {
          void subscriptionQuery.refetch()
        }}
      />
    </AuthLayout>
  )
}
