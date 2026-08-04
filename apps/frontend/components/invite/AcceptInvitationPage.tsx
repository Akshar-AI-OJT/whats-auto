'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check, Loader2, LogIn, UserPlus, X } from 'lucide-react'
import { api, type ApiError, type InvitationPreview, type ProfileUser } from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import { getValidAccessToken } from '@/lib/access-token'
import { Link, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { clearPendingInvitationId, savePendingInvitationId } from '@/lib/post-auth-redirect'
import { Button, buttonVariants } from '@/components/ui/button'
import { AuthLayout } from '@/components/auth/auth-layout'
import { AuthBranding } from '@/components/auth/auth-branding'
import {
  authOutlineButtonClassName,
  authPrimaryButtonClassName,
} from '@/components/auth/auth-field-styles'

type AcceptInvitationPageProps = {
  invitationId: string
  initialPreview: InvitationPreview | null
  initialErrorKey: 'notFound' | 'loadFailed' | null
}

function profileUserFromSession(
  user:
    | {
        id: string
        name: string
        email: string
        firstname?: string | null
        lastname?: string | null
        createdAt?: Date | string
        updatedAt?: Date | string
      }
    | null
    | undefined
): ProfileUser | null {
  if (!user) return null
  const source = user.name.trim() || user.email.trim() || 'WA'
  const initials = source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return {
    id: user.id,
    name: user.name,
    firstname: user.firstname ?? '',
    lastname: user.lastname ?? '',
    email: user.email,
    initials,
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null,
  }
}

export function AcceptInvitationPage({
  invitationId,
  initialPreview,
  initialErrorKey,
}: AcceptInvitationPageProps) {
  const t = useTranslations('inviteAccept')
  const locale = useLocale()
  const router = useRouter()

  const [preview, setPreview] = useState(initialPreview)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, setPending] = useState<'accept' | 'reject' | null>(null)
  const [declined, setDeclined] = useState(false)
  const [user, setUser] = useState<ProfileUser | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const autoAcceptStarted = useRef(false)

  const loadError =
    initialErrorKey === 'notFound'
      ? t('errors.notFound')
      : initialErrorKey === 'loadFailed'
        ? t('errors.loadFailed')
        : null

  useEffect(() => {
    savePendingInvitationId(invitationId)
  }, [invitationId])

  // Soft session probe — never blocks UI. Fail open as logged-out.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await authClient.getSession()
        if (!cancelled) setUser(profileUserFromSession(data?.user))
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setSessionReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const emailMatches =
    Boolean(user?.email) &&
    Boolean(preview?.email) &&
    user!.email.toLowerCase() === preview!.email.toLowerCase()

  const canAccept = emailMatches && preview?.status === 'pending' && pending === null

  function mapActionError(err: unknown): string {
    const apiError = err as ApiError
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return t('errors.slowNetwork')
    }
    if (apiError.status === 401) return t('errors.sessionExpired')
    if (apiError.code === 'E_INVITE_EXPIRED') return t('errors.expired')
    if (apiError.code === 'E_INVITE_NOT_PENDING') return t('errors.notPending')
    if (apiError.code === 'E_INVITE_EMAIL_MISMATCH') return t('errors.emailMismatch')
    if (apiError.code === 'E_INVITE_ALREADY_MEMBER') return t('errors.alreadyMember')
    if (apiError.code === 'E_INVITE_NOT_FOUND') return t('errors.notFound')
    return apiError.message || t('errors.generic')
  }

  async function handleAccept() {
    setActionError(null)
    setPending('accept')
    try {
      const { data } = await api.invitations.accept(invitationId)
      const organizationId =
        data && typeof data === 'object' && 'data' in data && data.data?.organizationId
          ? data.data.organizationId
          : data && typeof data === 'object' && 'organizationId' in data
            ? data.organizationId
            : null

      if (organizationId) {
        try {
          await api.organizations.setActive(organizationId)
          await authClient.getSession({ query: { disableCookieCache: true } })
          await getValidAccessToken()
        } catch {
          // Membership was created; dashboard refresh still picks up the org list.
        }
      }

      clearPendingInvitationId()
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setActionError(mapActionError(err))
      autoAcceptStarted.current = false
    } finally {
      setPending(null)
    }
  }

  // After signup/login, invitees land here authenticated — join without an extra click.
  useEffect(() => {
    if (!sessionReady) return
    if (!emailMatches || preview?.status !== 'pending') return
    if (autoAcceptStarted.current || pending !== null) return
    autoAcceptStarted.current = true
    void handleAccept()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady, emailMatches, preview?.status])

  async function handleDecline() {
    setActionError(null)
    setPending('reject')
    try {
      await api.invitations.reject(invitationId)
      clearPendingInvitationId()
      setDeclined(true)
      setPreview((prev) => (prev ? { ...prev, status: 'rejected' } : prev))
    } catch (err) {
      setActionError(mapActionError(err))
    } finally {
      setPending(null)
    }
  }

  const callbackPath = `/accept-invitation/${invitationId}`
  const invitedEmail = preview?.email ?? ''
  const loginHref = `/${locale}/login?callbackURL=${encodeURIComponent(callbackPath)}`
  const registerHref = `/${locale}/register?callbackURL=${encodeURIComponent(callbackPath)}${
    invitedEmail ? `&email=${encodeURIComponent(invitedEmail)}` : ''
  }`

  const showAcceptUi = preview?.status === 'pending' && Boolean(user) && emailMatches && !declined

  return (
    <AuthLayout branding={<AuthBranding variant="login" />}>
      <div className="flex w-full min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-2 text-left">
          <p className="text-xs font-semibold tracking-wide text-positive-deep uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="font-display text-[1.75rem] leading-8 tracking-tight text-ink sm:text-2xl">
            {t('title')}
          </h1>
          <p className="text-sm leading-6 text-body">{t('subtitle')}</p>
        </div>

        {loadError ? (
          <div
            role="alert"
            className="rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
          >
            {loadError}
          </div>
        ) : preview ? (
          <>
            <div className="rounded-2xl border border-[#E2E8F0] bg-canvas px-4 py-4 shadow-sm">
              <dl className="flex flex-col gap-3 text-sm">
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('fields.organization')}
                  </dt>
                  <dd className="mt-1 font-semibold text-ink">{preview.organizationName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('fields.role')}
                  </dt>
                  <dd className="mt-1 capitalize text-ink">{preview.role}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('fields.invitedBy')}
                  </dt>
                  <dd className="mt-1 text-ink">{preview.inviterName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-mute uppercase">
                    {t('fields.email')}
                  </dt>
                  <dd className="mt-1 text-ink">{preview.email}</dd>
                </div>
              </dl>
            </div>

            {declined || preview.status === 'rejected' ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl border border-primary/30 bg-primary-pale/50 px-4 py-3 text-sm text-positive-deep">
                  {t('declined')}
                </div>
                <Link href="/" className="text-sm font-semibold text-positive-deep hover:underline">
                  {t('backHome')}
                </Link>
              </div>
            ) : preview.status !== 'pending' ? (
              <p className="rounded-xl bg-dash-surface px-3 py-2 text-sm text-body">
                {t('status', { status: preview.status })}
              </p>
            ) : user && !emailMatches ? (
              <div className="flex flex-col gap-3">
                <div
                  role="alert"
                  className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink"
                >
                  {t('errors.wrongAccount', {
                    invited: preview.email,
                    signedIn: user.email,
                  })}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(pending)}
                  className={cn(authOutlineButtonClassName)}
                  onClick={handleDecline}
                >
                  {pending === 'reject' ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <X className="size-4" aria-hidden />
                  )}
                  {pending === 'reject' ? t('rejecting') : t('reject')}
                </Button>
              </div>
            ) : showAcceptUi ? (
              <div className="flex flex-col gap-2.5">
                {pending === 'accept' ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-dash-border bg-dash-surface/50 px-4 py-3 text-sm text-body">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('accepting')}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 sm:flex-row-reverse">
                    <Button
                      type="button"
                      disabled={!canAccept}
                      className={cn(authPrimaryButtonClassName, 'sm:flex-1')}
                      onClick={() => void handleAccept()}
                    >
                      <Check className="size-4" aria-hidden />
                      {t('accept')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={Boolean(pending)}
                      className={cn(authOutlineButtonClassName, 'sm:flex-1')}
                      onClick={handleDecline}
                    >
                      {pending === 'reject' ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <X className="size-4" aria-hidden />
                      )}
                      {pending === 'reject' ? t('rejecting') : t('reject')}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {!sessionReady ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-dash-border bg-dash-surface/50 px-4 py-3 text-sm text-body">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('accepting')}
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-body">{t('signInPrompt')}</p>
                    <a
                      href={loginHref}
                      className={cn(
                        buttonVariants({ variant: 'default' }),
                        authPrimaryButtonClassName
                      )}
                    >
                      <LogIn className="size-4" aria-hidden />
                      {t('signIn')}
                    </a>
                    <a
                      href={registerHref}
                      className={cn(
                        buttonVariants({ variant: 'outline' }),
                        authOutlineButtonClassName
                      )}
                    >
                      <UserPlus className="size-4" aria-hidden />
                      {t('createAccount')}
                    </a>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={Boolean(pending)}
                      className={cn(authOutlineButtonClassName)}
                      onClick={handleDecline}
                    >
                      {pending === 'reject' ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          {t('rejecting')}
                        </>
                      ) : (
                        <>
                          <X className="size-4" aria-hidden />
                          {t('reject')}
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}

            {actionError ? (
              <p role="alert" className="text-sm text-negative">
                {actionError}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </AuthLayout>
  )
}
