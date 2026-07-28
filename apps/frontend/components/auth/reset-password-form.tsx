'use client'

import { useId, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, CircleCheck, Loader2, Lock, X } from 'lucide-react'
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
import { AuthPasswordToggle } from '@/components/auth/auth-password-toggle'
import {
  authInputWithIconClassName,
  authPrimaryButtonClassName,
} from '@/components/auth/auth-field-styles'
import { Link, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

type FieldErrors = {
  password?: string
  confirmPassword?: string
}

type Strength = 'weak' | 'medium' | 'strong'

/** Client-only strength score — does not change backend password rules. */
function getPasswordStrength(password: string): Strength | null {
  if (!password) return null

  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1

  if (score <= 2) return 'weak'
  if (score <= 3) return 'medium'
  return 'strong'
}

const strengthFill: Record<Strength, string> = {
  weak: 'bg-negative',
  medium: 'bg-warning-deep',
  strong: 'bg-positive',
}

const strengthText: Record<Strength, string> = {
  weak: 'text-negative',
  medium: 'text-warning-deep',
  strong: 'text-positive-deep',
}

const backLinkClassName =
  'inline-flex items-center justify-center gap-1.5 rounded-sm text-sm leading-5 font-medium text-body transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'

export function ResetPasswordForm({ className, ...props }: React.ComponentProps<'form'>) {
  const t = useTranslations('auth.resetPassword')
  const router = useRouter()
  const searchParams = useSearchParams()

  const token = searchParams.get('token') ?? ''
  const formErrorId = useId()
  const passwordId = useId()
  const confirmPasswordId = useId()
  const passwordErrorId = useId()
  const confirmPasswordErrorId = useId()
  const strengthId = useId()
  const requirementsId = useId()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, setPending] = useState(false)

  const strength = getPasswordStrength(password)
  const strengthLevel =
    strength === 'weak' ? 1 : strength === 'medium' ? 2 : strength === 'strong' ? 3 : 0

  const requirements = useMemo(
    () => [
      {
        id: 'length',
        label: t('requirements.length'),
        met: password.length >= 8,
      },
      {
        id: 'case',
        label: t('requirements.case'),
        met: /[a-z]/.test(password) && /[A-Z]/.test(password),
      },
      {
        id: 'number',
        label: t('requirements.number'),
        met: /\d/.test(password),
      },
      {
        id: 'special',
        label: t('requirements.special'),
        met: /[^A-Za-z0-9]/.test(password),
      },
    ],
    [password, t]
  )

  function validate(): FieldErrors {
    const next: FieldErrors = {}

    if (!password) {
      next.password = t('errors.passwordRequired')
    } else if (password.length < 8) {
      next.password = t('errors.length')
    }

    if (!confirmPassword) {
      next.confirmPassword = t('errors.confirmRequired')
    } else if (password !== confirmPassword) {
      next.confirmPassword = t('errors.mismatch')
    }

    return next
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const nextErrors = validate()
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setPending(true)

    try {
      await api.auth.resetPassword({ token, newPassword: password })
      setSuccess(true)
      setTimeout(() => router.push('/login'), 2000)
    } catch (err) {
      setError((err as ApiError).message || t('errors.generic'))
    } finally {
      setPending(false)
    }
  }

  if (!token) {
    return (
      <FieldGroup className="gap-8">
        <div
          role="alert"
          className="rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-left text-sm leading-5 text-negative"
        >
          {t('errors.invalidToken')}
        </div>
        <FieldDescription className="text-center">
          <Link href="/forgot-password" className={backLinkClassName}>
            <ArrowLeft className="size-3.5" aria-hidden />
            {t('requestNew')}
          </Link>
        </FieldDescription>
      </FieldGroup>
    )
  }

  if (success) {
    return (
      <FieldGroup className="gap-8">
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-4 text-left"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-positive/10 text-positive">
            <CircleCheck className="size-7" aria-hidden strokeWidth={1.75} />
          </span>
          <div className="flex flex-col gap-3">
            <h1 className="font-display text-[1.75rem] leading-8 tracking-tight text-ink sm:text-2xl">
              {t('successTitle')}
            </h1>
            <p className="text-sm leading-6 text-pretty text-body">{t('successSubtitle')}</p>
          </div>
        </div>
        <FieldDescription className="text-center">
          <Link href="/login" className={backLinkClassName}>
            <ArrowLeft className="size-3.5" aria-hidden />
            {t('backToLogin')}
          </Link>
        </FieldDescription>
      </FieldGroup>
    )
  }

  return (
    <form
      className={cn('flex w-full min-w-0 flex-col', className)}
      onSubmit={handleSubmit}
      noValidate
      aria-busy={pending}
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
              autoComplete="new-password"
              required
              minLength={8}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={
                [
                  fieldErrors.password ? passwordErrorId : null,
                  password ? strengthId : null,
                  requirementsId,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
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
              disabled={pending}
              labelShow={t('showPassword')}
              labelHide={t('hidePassword')}
              controls={passwordId}
              onToggle={() => setShowPassword((prev) => !prev)}
            />
          </div>

          {password ? (
            <div id={strengthId} className="flex flex-col gap-2" aria-live="polite">
              <div
                className="grid grid-cols-3 gap-1"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={3}
                aria-valuenow={strengthLevel}
                aria-label={t('passwordStrengthLabel')}
              >
                {[1, 2, 3].map((segment) => (
                  <div
                    key={segment}
                    className={cn(
                      'h-1 rounded-full bg-border transition-colors',
                      strength && segment <= strengthLevel && strengthFill[strength]
                    )}
                  />
                ))}
              </div>
              {strength ? (
                <p className={cn('text-xs leading-4 font-medium', strengthText[strength])}>
                  {t(`passwordStrength.${strength}`)}
                </p>
              ) : null}
            </div>
          ) : null}

          <ul id={requirementsId} className="flex flex-col gap-1.5 pt-1">
            {requirements.map((req) => (
              <li
                key={req.id}
                className={cn(
                  'flex items-center gap-2 text-xs leading-4',
                  req.met ? 'text-positive-deep' : 'text-mute'
                )}
              >
                {req.met ? (
                  <Check className="size-3.5 shrink-0" aria-hidden />
                ) : (
                  <X className="size-3.5 shrink-0 opacity-50" aria-hidden />
                )}
                {req.label}
              </li>
            ))}
          </ul>

          {fieldErrors.password ? (
            <FieldError id={passwordErrorId} className="text-xs leading-4 text-negative">
              {fieldErrors.password}
            </FieldError>
          ) : null}
        </Field>

        <Field
          data-invalid={fieldErrors.confirmPassword ? true : undefined}
          className="gap-2"
        >
          <FieldLabel
            htmlFor={confirmPasswordId}
            className="text-sm font-medium leading-5 text-ink"
          >
            {t('confirmPassword')}
          </FieldLabel>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              id={confirmPasswordId}
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={
                fieldErrors.confirmPassword ? confirmPasswordErrorId : undefined
              }
              className={cn(authInputWithIconClassName, 'pr-12')}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                if (fieldErrors.confirmPassword) {
                  setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }))
                }
              }}
            />
            <AuthPasswordToggle
              show={showConfirmPassword}
              disabled={pending}
              labelShow={t('showConfirmPassword')}
              labelHide={t('hideConfirmPassword')}
              controls={confirmPasswordId}
              onToggle={() => setShowConfirmPassword((prev) => !prev)}
            />
          </div>
          {fieldErrors.confirmPassword ? (
            <FieldError
              id={confirmPasswordErrorId}
              className="text-xs leading-4 text-negative"
            >
              {fieldErrors.confirmPassword}
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
            disabled={pending}
            aria-busy={pending}
            className={authPrimaryButtonClassName}
          >
            {pending ? (
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
          <Link href="/login" className={backLinkClassName}>
            <ArrowLeft className="size-3.5" aria-hidden />
            {t('backToLogin')}
          </Link>
        </FieldDescription>
      </FieldGroup>
    </form>
  )
}
