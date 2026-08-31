'use client'

import type { ReactNode } from 'react'
import { useEntitlements } from '@/hooks/use-entitlements'
import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

type PlanGateProps = {
  featureKey: string
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Hides children when the org plan lacks the given feature key.
 * Shows a simple upgrade prompt linking to billing checkout by default.
 */
export function PlanGate({ featureKey, children, fallback }: PlanGateProps) {
  const { hasFeature, isLoading, isError } = useEntitlements()

  if (isLoading) return null
  if (isError) return <>{children}</>
  if (hasFeature(featureKey)) return <>{children}</>

  if (fallback) return <>{fallback}</>

  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dash-border bg-canvas p-6">
      <p className="text-sm font-semibold text-ink">This feature is not on your plan</p>
      <p className="text-sm text-mute">
        Upgrade to unlock <span className="font-medium text-ink">{featureKey}</span>.
      </p>
      <Link href="/dashboard/billing" className={cn(buttonVariants())}>
        View plans
      </Link>
    </div>
  )
}
