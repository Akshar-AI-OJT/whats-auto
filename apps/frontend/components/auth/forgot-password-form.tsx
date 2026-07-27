'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, CircleCheck, Loader2, Mail } from 'lucide-react'
import { api, type ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  authInputWithIconClassName,
  authOutlineButtonClassName,
  authPrimaryButtonClassName,
} from '@/components/auth/auth-field-styles'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

type Pending = 'idle' | 'submit' | 'resend'

const backToLoginClassName =
  'inline-flex items-center justify-center gap-1.5 rounded-sm text-sm leading-5 font-medium text-body transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'

export function ForgotPasswordForm({ className, ...props }: React.ComponentProps<'form'>) {
  const t = useTranslations('auth.forgotPassword')
  const locale = useLocale()
  const formErrorId = useId()
  const successId = useId()
  const emailId = useId()
  const emailErrorId = useId()

  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>('idle')
  const [resendCooldown, setResendCooldown] = useState(0)
  const cooldownTimerRef = useRef<number | null>(null)

  const isPending = pending !== 'idle'

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current !== null) {
        window.clearInterval(cooldownTimerRef.current)
      }
    }
  }, [])

  function startResendCooldown(seconds = 30) {
    if (cooldownTimerRef.current !== null) {
      window.clearInterval(cooldownTimerRef.current)
    }
    setResendCooldown(seconds)
    cooldownTimerRef.current = window.setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current !== null) {
            window.clearInterval(cooldownTimerRef.current)
            cooldownTimerRef.current = null
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function validate(): string | null {
    if (!email.trim()) return t('errors.emailRequired')
    if (!isValidEmail(email.trim())) return t('errors.emailInvalid')
    return null
  }

  async function sendResetLink(mode: 'submit' | 'resend') {
    setError(null)
    setPending(mode)

    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      await api.auth.forgotPassword({
        email: email.trim(),
        redirectTo: `${appUrl}/${locale}/reset-password`,
      })
      setSent(true)
      startResendCooldown(30)
    } catch (err) {
      const apiError = err as ApiError
      if (apiError.code === 'USE_GOOGLE_SIGN_IN') {
        setError(t('errors.useGoogle'))
        setSent(false)
      } else {
        setError(apiError.message || t('errors.generic'))
        if (mode === 'submit') setSent(false)
      }
    } finally {
      setPending('idle')
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const nextFieldError = validate()
    setFieldError(nextFieldError)
    if (nextFieldError) return

    await sendResetLink('submit')
  }

  async function handleResend() {
    if (resendCooldown > 0 || isPending) return
    await sendResetLink('resend')
  }

  if (sent) {
    return (
      <div className="flex w-full min-w-0 flex-col">
        <FieldGroup className="gap-8">
          <div
            id={successId}
            role="status"
            aria-live="polite"
            className="flex flex-col gap-4 text-left"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-positive/10 text-positive">
              <CircleCheck className="size-7" aria-hidden strokeWidth={1.75} />
            </span>
            <div className="flex flex-col gap-3">
              <h1 className="font-display text-[1.75rem] leading-8 tracking-tight text-ink sm:text-2xl">
                {t('sentTitle')}
              </h1>
              <p className="text-sm leading-6 text-pretty text-body">{t('sentSubtitle')}</p>
            </div>
          </div>

          {error ? (
            <div
              id={formErrorId}
              role="alert"
              className="rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-left text-sm leading-5 text-negative"
            >
              {error}
            </div>
          ) : null}

          <Field className="gap-5">
            <Button
              type="button"
              variant="outline"
              disabled={isPending || resendCooldown > 0}
              aria-busy={pending === 'resend'}
              className={authOutlineButtonClassName}
              onClick={() => void handleResend()}
            >
              {pending === 'resend' ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  <span>{t('resending')}</span>
                </>
              ) : resendCooldown > 0 ? (
                t('resendCooldown', { seconds: resendCooldown })
              ) : (
                t('resend')
              )}
            </Button>

            <FieldDescription className="text-center">
              <Link href="/login" className={backToLoginClassName}>
                <ArrowLeft className="size-3.5" aria-hidden />
                {t('backToLogin')}
              </Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </div>
    )
  }

  return (
    <form
      className={cn('flex w-full min-w-0 flex-col', className)}
      onSubmit={handleSubmit}
      noValidate
      aria-busy={isPending}
      aria-describedby={error ? formErrorId : undefined}
      {...props}
    >
      <FieldGroup className="gap-8">
        <div className="flex flex-col gap-3 text-left">
          <h1 className="font-display text-[1.75rem] leading-8 tracking-tight text-ink sm:text-2xl">
            {t('title')}
          </h1>
          <p className="text-sm leading-6 text-pretty text-body">{t('subtitle')}</p>
        </div>

        <Field data-invalid={fieldError ? true : undefined} className="gap-2">
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
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? emailErrorId : undefined}
              className={authInputWithIconClassName}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (fieldError) setFieldError(null)
              }}
            />
          </div>
          {fieldError ? (
            <FieldError id={emailErrorId} className="text-xs leading-4 text-negative">
              {fieldError}
            </FieldError>
          ) : null}
        </Field>

        {error ? (
          <div
            id={formErrorId}
            role="alert"
            className="rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-left text-sm leading-5 text-negative"
          >
            {error}
          </div>
        ) : null}

        <Field className="gap-0">
          <Button
            type="submit"
            disabled={isPending}
            aria-busy={pending === 'submit'}
            className={authPrimaryButtonClassName}
          >
            {pending === 'submit' ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                <span>{t('submitting')}</span>
              </>
            ) : (
              t('submit')
            )}
          </Button>
        </Field>

        <FieldDescription className="text-center">
          <Link href="/login" className={backToLoginClassName}>
            <ArrowLeft className="size-3.5" aria-hidden />
            {t('backToLogin')}
          </Link>
        </FieldDescription>
      </FieldGroup>
    </form>
  )
}
