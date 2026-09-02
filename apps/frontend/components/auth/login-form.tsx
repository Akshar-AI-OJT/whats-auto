'use client'

import { useEffect, useId, useState, startTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Loader2, Lock, Mail } from 'lucide-react'
import { FcGoogle } from 'react-icons/fc'
import { cn } from '@/lib/utils'
import type { ApiError } from '@/lib/api'
import { authClient, formatBetterAuthError } from '@/lib/auth-client'
import { buildLocalizedAppUrl } from '@/lib/app-origin'
import { getValidAccessToken } from '@/lib/access-token'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthPasswordToggle } from '@/components/auth/auth-password-toggle'
import {
  authDividerClassName,
  authInputWithIconClassName,
  authOutlineButtonClassName,
  authPrimaryButtonClassName,
} from '@/components/auth/auth-field-styles'
import { Link, useRouter } from '@/i18n/navigation'
import { authHandoffHref, resolvePostAuthPath } from '@/lib/post-auth-redirect'

const REMEMBER_EMAIL_KEY = 'whats-auto-remember-email'

type FieldErrors = {
  email?: string
  password?: string
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/** Only allow same-origin relative paths (blocks open redirects). */
function safeCallbackPath(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}

export function LoginForm({ className, ...props }: React.ComponentProps<'form'>) {
  const t = useTranslations('auth.login')
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackPath = safeCallbackPath(searchParams.get('callbackURL'))
  const oauthErrorParam = searchParams.get('error')
  const isAccountNotFound =
    oauthErrorParam === 'account_not_found' ||
    oauthErrorParam === 'sign_up_disabled' ||
    oauthErrorParam === 'signup_disabled' ||
    oauthErrorParam === 'user_not_found'
  const oauthFailed =
    !isAccountNotFound &&
    (oauthErrorParam === 'oauth_failed' ||
      oauthErrorParam === 'state_mismatch' ||
      oauthErrorParam === 'state_security_mismatch' ||
      oauthErrorParam === 'account_not_linked' ||
      oauthErrorParam === 'unable_to_create_user' ||
      oauthErrorParam === 'unable_to_create_session')
  const formErrorId = useId()
  const emailId = useId()
  const passwordId = useId()
  const rememberId = useId()
  const emailErrorId = useId()
  const passwordErrorId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'idle' | 'email' | 'google'>('idle')
  const isPending = pending !== 'idle'
  const displayError =
    error ??
    (isAccountNotFound ? t('errors.accountNotFound') : oauthFailed ? t('errors.oauthFailed') : null)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REMEMBER_EMAIL_KEY)
      if (saved) {
        startTransition(() => {
          setEmail(saved)
          setRememberMe(true)
        })
      }
    } catch {
      /* ignore storage errors */
    }
  }, [])

  function validate(): FieldErrors {
    const next: FieldErrors = {}

    if (!email.trim()) {
      next.email = t('errors.emailRequired')
    } else if (!isValidEmail(email.trim())) {
      next.email = t('errors.emailInvalid')
    }

    if (!password) {
      next.password = t('errors.passwordRequired')
    }

    return next
  }

  function persistRememberedEmail(nextEmail: string, remember: boolean) {
    try {
      if (remember) {
        window.localStorage.setItem(REMEMBER_EMAIL_KEY, nextEmail)
      } else {
        window.localStorage.removeItem(REMEMBER_EMAIL_KEY)
      }
    } catch {
      /* ignore storage errors */
    }
  }

  async function handleGoogle() {
    setError(null)
    setFieldErrors({})
    setPending('google')

    try {
      const redirectPath = callbackPath ?? '/dashboard'
      const callbackURL = buildLocalizedAppUrl(locale, redirectPath)
      const errorCallbackURL = buildLocalizedAppUrl(locale, '/login')
      const { error: authErr } = await authClient.signIn.social({
        provider: 'google',
        callbackURL,
        errorCallbackURL,
      })
      if (authErr) throw formatBetterAuthError(authErr)
      // Successful social auth redirects the browser; keep pending if we somehow stay.
    } catch (err) {
      const apiError = err as ApiError
      if (
        apiError.code === 'ACCOUNT_NOT_FOUND' ||
        apiError.code === 'SIGN_UP_DISABLED' ||
        apiError.code === 'SIGNUP_DISABLED'
      ) {
        setError(t('errors.accountNotFound'))
      } else if (apiError.code === 'EMAIL_ALREADY_EXISTS') {
        setError(t('errors.emailExists'))
      } else {
        setError(apiError.message || t('errors.generic'))
      }
      setPending('idle')
    }
  }

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const nextErrors = validate()
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const trimmedEmail = email.trim()
    persistRememberedEmail(trimmedEmail, rememberMe)
    setPending('email')

    try {
      const { error: authErr } = await authClient.signIn.email({
        email: trimmedEmail,
        password,
      })
      if (authErr) throw formatBetterAuthError(authErr)

      // JWT plugin seeds on get-session; mint before first protected call.
      await authClient.getSession({ query: { disableCookieCache: true } })
      await getValidAccessToken()

      const nextPath = await resolvePostAuthPath({
        preferredCallback: callbackPath,
        fallback: '/dashboard',
      })
      router.push(nextPath)
      router.refresh()
    } catch (err) {
      setError((err as ApiError).message || t('errors.generic'))
    } finally {
      setPending('idle')
    }
  }

  return (
    <form
      className={cn('flex w-full min-w-0 flex-col', className)}
      onSubmit={handleSubmit}
      noValidate
      aria-busy={isPending}
      aria-describedby={displayError ? formErrorId : undefined}
      {...props}
    >
      <FieldGroup className="gap-8">
        <div className="flex flex-col gap-3 text-left">
          <h1 className="font-display text-[1.75rem] leading-8 tracking-tight text-ink sm:text-2xl">
            {t('title')}
          </h1>
          <p className="text-sm leading-6 text-pretty text-body">{t('subtitle')}</p>
        </div>

        <Field data-invalid={fieldErrors.email ? true : undefined} className="gap-2">
          <FieldLabel htmlFor={emailId} className="text-sm font-medium leading-5 text-ink">
            {t('email')}
          </FieldLabel>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              id={emailId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="johndoe@mail.com"
              required
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? emailErrorId : undefined}
              className={authInputWithIconClassName}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (fieldErrors.email) {
                  setFieldErrors((prev) => ({ ...prev, email: undefined }))
                }
              }}
            />
          </div>
          {fieldErrors.email ? (
            <FieldError id={emailErrorId} className="text-xs leading-4 text-negative">
              {fieldErrors.email}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.password ? true : undefined} className="gap-2">
          <FieldLabel htmlFor={passwordId} className="text-sm font-medium leading-5 text-ink">
            {t('password')}
          </FieldLabel>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              id={passwordId}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? passwordErrorId : undefined}
              className={cn(authInputWithIconClassName, 'pr-12')}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: undefined }))
                }
              }}
            />
            <AuthPasswordToggle
              show={showPassword}
              disabled={isPending}
              labelShow={t('showPassword')}
              labelHide={t('hidePassword')}
              controls={passwordId}
              onToggle={() => setShowPassword((prev) => !prev)}
            />
          </div>
          {fieldErrors.password ? (
            <FieldError id={passwordErrorId} className="text-xs leading-4 text-negative">
              {fieldErrors.password}
            </FieldError>
          ) : null}
        </Field>

        <div className="flex items-center justify-between gap-4">
          <label
            htmlFor={rememberId}
            className="flex cursor-pointer items-center gap-2 text-sm leading-5 text-body select-none"
          >
            <input
              id={rememberId}
              name="rememberMe"
              type="checkbox"
              checked={rememberMe}
              disabled={isPending}
              onChange={(e) => setRememberMe(e.target.checked)}
              className={cn(
                'size-4 shrink-0 rounded border border-border bg-canvas text-primary',
                'accent-primary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            />
            {t('rememberMe')}
          </label>
          <Link
            href="/forgot-password"
            className="shrink-0 rounded-sm text-sm leading-5 font-medium text-body underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            {t('forgotPassword')}
          </Link>
        </div>

        {displayError ? (
          <div
            id={formErrorId}
            role="alert"
            className="rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-left text-sm leading-5 text-negative"
          >
            {displayError}
          </div>
        ) : null}

        <Field className="gap-0">
          <Button
            type="submit"
            disabled={isPending}
            aria-busy={pending === 'email'}
            className={authPrimaryButtonClassName}
          >
            {pending === 'email' ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                <span>{t('submitting')}</span>
              </>
            ) : (
              t('submit')
            )}
          </Button>
        </Field>

        <FieldSeparator className={authDividerClassName}>{t('orContinue')}</FieldSeparator>

        <Field className="gap-5">
          <Button
            variant="outline"
            type="button"
            disabled={isPending}
            aria-busy={pending === 'google'}
            className={authOutlineButtonClassName}
            onClick={() => void handleGoogle()}
          >
            {pending === 'google' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <FcGoogle className="size-5" aria-hidden />
            )}
            <span>{t('google')}</span>
          </Button>
          <FieldDescription className="text-center text-sm leading-5 text-body">
            {t('noAccount')}{' '}
            <Link
              href={authHandoffHref('/register', { callbackPath })}
              className="rounded-sm font-medium text-ink underline underline-offset-4 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              {t('signUp')}
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
