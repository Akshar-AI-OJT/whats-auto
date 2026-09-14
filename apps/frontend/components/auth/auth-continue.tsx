'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { getValidAccessToken } from '@/lib/access-token'
import { authClient } from '@/lib/auth-client'
import { ORG_SETUP_PATH } from '@/lib/onboarding'
import { prefetchDashboardOrganizationQueries } from '@/lib/organization-queries'
import { resolvePostAuthPath, safeCallbackPath } from '@/lib/post-auth-redirect'
import { useRouter } from '@/i18n/navigation'

/**
 * Shared post-OAuth router: mint session JWT, then follow onboarding state
 * (zero live memberships → org setup, never bare `/dashboard`).
 */
export function AuthContinue() {
  const t = useTranslations('auth.continue')
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const preferredCallback = safeCallbackPath(searchParams.get('callbackURL'))
  const started = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (started.current) return
    started.current = true

    void (async () => {
      try {
        const sessionResult = await authClient.getSession({ query: { disableCookieCache: true } })
        await getValidAccessToken()
        const userId = sessionResult.data?.user?.id ?? null
        await prefetchDashboardOrganizationQueries(queryClient, userId, {
          sessionOrganizationId: sessionResult.data?.session?.activeOrganizationId ?? null,
        })
        const nextPath = await resolvePostAuthPath({
          preferredCallback,
          fallback: ORG_SETUP_PATH,
        })
        router.replace(nextPath)
        router.refresh()
      } catch {
        setError(t('errors.generic'))
      }
    })()
  }, [preferredCallback, queryClient, router, t])

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm leading-6 text-negative" role="alert">
          {error}
        </p>
        <button
          type="button"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => router.replace('/login')}
        >
          {t('backToLogin')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm leading-5 text-mute">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>{t('loading')}</span>
    </div>
  )
}
