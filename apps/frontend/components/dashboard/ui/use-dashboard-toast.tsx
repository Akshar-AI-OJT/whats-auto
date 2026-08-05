'use client'

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export type DashboardToastVariant = 'error' | 'success'

type DashboardToastState = {
  message: string
  variant: DashboardToastVariant
}

const TOAST_DURATION_MS = 5000

export function useDashboardToast() {
  const [toast, setToast] = useState<DashboardToastState | null>(null)

  const clearToast = useCallback(() => {
    setToast(null)
  }, [])

  const showToast = useCallback((message: string, variant: DashboardToastVariant = 'error') => {
    setToast({ message, variant })
  }, [])

  useEffect(() => {
    if (!toast) return
    const handle = window.setTimeout(() => setToast(null), TOAST_DURATION_MS)
    return () => window.clearTimeout(handle)
  }, [toast])

  return { toast, showToast, clearToast }
}

type DashboardToastProps = {
  message: string
  variant?: DashboardToastVariant
  className?: string
  onDismiss?: () => void
}

/** Inline toast banner — matches admin dashboard success/error styling. */
export function DashboardToast({
  message,
  variant = 'error',
  className,
  onDismiss,
}: DashboardToastProps) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-xl border px-3 py-2 text-sm leading-5',
        variant === 'error'
          ? 'border-negative/25 bg-negative/5 text-negative'
          : 'border-primary/30 bg-primary-pale/50 text-positive-deep',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p>{message}</p>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-xs font-medium opacity-70 transition-opacity hover:opacity-100"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  )
}
