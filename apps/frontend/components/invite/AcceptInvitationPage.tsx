'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check, Loader2, LogIn, UserPlus, X } from 'lucide-react'
import { api, type ApiError, type InvitationPreview, type ProfileUser } from '@/lib/api'
import { Link, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
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

function sessionUserFromPayload(data: unknown): ProfileUser | null {
  if (!data || typeof data !== 'object' || !('user' in data)) return null
  return (data as { user: ProfileUser | null }).user ?? null
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

  const loadError =
    initialErrorKey === 'notFound'
      ? t('errors.notFound')
      : initialErrorKey === 'loadFailed'
        ? t('errors.loadFailed')
        : null

  // Soft session probe — never blocks UI. Fail open as logged-out.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.auth.getSession()
        if (!cancelled) setUser(sessionUserFromPayload(data))
      } catch {
        if (!cancelled) setUser(null)
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

  const canAccept =
    emailMatches && preview?.status === 'pending' && !pending

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

      // Persist active workspace on this session (backend also writes it; this covers
      // cookie/session edge cases so the invitee lands in the invited org).
      if (organizationId) {
        try {
          await api.organizations.setActive(organizationId)
        } catch {
          // Membership was created; dashboard refresh still picks up the org list.
        }
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setActionError(mapActionError(err))
    } finally {
      setPending(null)
    }
  }

  async function handleDecline() {
    setActionError(null)
    setPending('reject')
    try {
      await api.invitations.reject(invitationId)
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
            ) : canAccept ? (
              <div className="flex flex-col gap-2.5 sm:flex-row-reverse">
                <Button
                  type="button"
                  disabled={!canAccept}
                  className={cn(authPrimaryButtonClassName, 'sm:flex-1')}
                  onClick={handleAccept}
                >
                  {pending === 'accept' ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="size-4" aria-hidden />
                  )}
                  {pending === 'accept' ? t('accepting') : t('accept')}
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
            ) : (
              <div className="flex flex-col gap-2.5">
                <p className="text-sm text-body">{t('signInPrompt')}</p>
                {/* Hard navigation avoids Next soft-nav getting stuck on "Loading…" */}
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
              </div>
            )}
          </>
        ) : (
          <div
            role="alert"
            className="rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
          >
            {t('errors.notFound')}
          </div>
        )}

        {actionError ? (
          <div
            role="alert"
            className="rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
          >
            {actionError}
          </div>
        ) : null}
      </div>
    </AuthLayout>
  )
}
