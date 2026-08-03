'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, Clock3, Loader2, Lock, Mail, Phone, User } from 'lucide-react'
import { FcGoogle } from 'react-icons/fc'
import { cn } from '@/lib/utils'
import { api, type ApiError } from '@/lib/api'
import {
  isValidEmail,
  isValidPhone,
  ORG_SETUP_PATH,
  savePendingOnboardingContact,
} from '@/lib/onboarding'
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
  authInputClassName,
  authInputWithIconClassName,
  authOutlineButtonClassName,
  authPrimaryButtonClassName,
} from '@/components/auth/auth-field-styles'
import { AuthLayout } from '@/components/auth/auth-layout'
import { AuthBranding } from '@/components/auth/auth-branding'
import { Link, useRouter } from '@/i18n/navigation'

type Step = 'register' | 'otp'
type Pending = 'idle' | 'register' | 'google' | 'otp' | 'resend'
type Strength = 'weak' | 'medium' | 'strong'

type FieldErrors = {
  firstname?: string
  lastname?: string
  email?: string
  phone?: string
  password?: string
  confirmPassword?: string
  otp?: string
}

const OTP_LENGTH = 6

/** Only allow same-origin relative paths (blocks open redirects). */
function safeCallbackPath(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}

function readSignupQuery(): { callbackPath: string | null; email: string } {
  if (typeof window === 'undefined') {
    return { callbackPath: null, email: '' }
  }
  try {
    const params = new URLSearchParams(window.location.search)
    return {
      callbackPath: safeCallbackPath(params.get('callbackURL')),
      email: (params.get('email') ?? '').trim(),
    }
  } catch {
    return { callbackPath: null, email: '' }
  }
}

const backToLoginClassName =
  'inline-flex items-center justify-center gap-1.5 rounded-sm text-sm leading-5 font-medium text-body transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'


function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

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

export function SignupForm({ className, ...props }: React.ComponentProps<'form'>) {
  const t = useTranslations('auth.register')
  const locale = useLocale()
  const router = useRouter()

  const formErrorId = useId()
  const firstnameId = useId()
  const lastnameId = useId()
  const emailId = useId()
  const phoneId = useId()
  const passwordId = useId()
  const confirmPasswordId = useId()
  const otpId = useId()
  const passwordHintId = useId()
  const strengthId = useId()
  const otpHintId = useId()

  const firstnameErrorId = useId()
  const lastnameErrorId = useId()
  const emailErrorId = useId()
  const phoneErrorId = useId()
  const passwordErrorId = useId()
  const confirmPasswordErrorId = useId()
  const otpErrorId = useId()

  const [step, setStep] = useState<Step>('register')
  const [firstname, setFirstname] = useState('')
  const [lastname, setLastname] = useState('')
  const [email, setEmail] = useState('')
  const [emailLocked, setEmailLocked] = useState(false)
  const [callbackPath, setCallbackPath] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>('idle')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)

  useEffect(() => {
    const query = readSignupQuery()
    setCallbackPath(query.callbackPath)
    if (query.email) {
      setEmail(query.email)
      setEmailLocked(Boolean(query.callbackPath?.startsWith('/accept-invitation/')))
    }
  }, [])
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([])

  const isPending = pending !== 'idle'
  const strength = getPasswordStrength(password)
  const strengthLevel =
    strength === 'weak' ? 1 : strength === 'medium' ? 2 : strength === 'strong' ? 3 : 0

  /** Single countdown interval — keyed by deadline so Strict Mode remounts cleanly. */
  useEffect(() => {
    if (cooldownUntil === null) return

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
      setResendCooldown(remaining)
      if (remaining <= 0) {
        setCooldownUntil(null)
      }
    }

    tick()
    const intervalId = window.setInterval(tick, 1000)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [cooldownUntil])

  function clearFieldError(key: keyof FieldErrors) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      return { ...prev, [key]: undefined }
    })
  }

  function startResendCooldown(seconds = 60) {
    setCooldownUntil(Date.now() + seconds * 1000)
  }

  function validateRegister(): FieldErrors {
    const next: FieldErrors = {}

    if (!firstname.trim()) next.firstname = t('errors.firstnameRequired')
    if (!lastname.trim()) next.lastname = t('errors.lastnameRequired')

    if (!email.trim()) {
      next.email = t('errors.emailRequired')
    } else if (!isValidEmail(email.trim())) {
      next.email = t('errors.emailInvalid')
    }

    if (!phone.trim()) {
      next.phone = t('errors.phoneRequired')
    } else if (!isValidPhone(phone)) {
      next.phone = t('errors.phoneInvalid')
    }

    if (!password) {
      next.password = t('errors.passwordRequired')
    } else if (password.length < 8) {
      next.password = t('errors.passwordLength')
    }

    if (!confirmPassword) {
      next.confirmPassword = t('errors.confirmPasswordRequired')
    } else if (password !== confirmPassword) {
      next.confirmPassword = t('errors.passwordMismatch')
    }

    return next
  }

  function validateOtp(): FieldErrors {
    const next: FieldErrors = {}
    if (!otp) {
      next.otp = t('errors.otpRequired')
    } else if (otp.length !== 6) {
      next.otp = t('errors.otpInvalid')
    }
    return next
  }

  async function handleGoogle() {
    setError(null)
    setFieldErrors({})
    setPending('google')

    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      const redirectPath = callbackPath ?? ORG_SETUP_PATH
      const { data } = await api.auth.google(`${appUrl}/${locale}${redirectPath}`)
      if (data.url) {
        window.location.href = data.url
        return
      }
      setError(t('errors.generic'))
    } catch (err) {
      const apiError = err as ApiError
      if (apiError.code === 'EMAIL_ALREADY_EXISTS') {
        setError(t('errors.emailExists'))
      } else {
        setError(apiError.message || t('errors.generic'))
      }
    } finally {
      setPending('idle')
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const nextErrors = validateRegister()
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setPending('register')

    try {
      await api.auth.signup({
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        email: email.trim(),
        password,
      })
      // Phone is collected for org setup (users table has no phone column yet).
      savePendingOnboardingContact({ email: email.trim(), phone: phone.trim() })
      setStep('otp')
      startResendCooldown(60)
    } catch (err) {
      const apiError = err as ApiError
      if (apiError.code === 'EMAIL_ALREADY_EXISTS') {
        setError(t('errors.emailExists'))
      } else {
        setError(apiError.message || t('errors.generic'))
      }
    } finally {
      setPending('idle')
    }
  }

  async function handleVerifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const nextErrors = validateOtp()
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setPending('otp')

    try {
      await api.auth.verifyOtp({ email, otp, password })
      // Invitees return to accept page; normal signups continue to org setup.
      if (callbackPath?.startsWith('/accept-invitation/')) {
        router.push(callbackPath)
      } else {
        savePendingOnboardingContact({ email: email.trim(), phone: phone.trim() })
        router.push(ORG_SETUP_PATH)
      }
      router.refresh()
    } catch (err) {
      setError((err as ApiError).message || t('errors.generic'))
    } finally {
      setPending('idle')
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return

    setError(null)
    setPending('resend')

    try {
      await api.auth.resendOtp({ email })
      startResendCooldown(60)
    } catch (err) {
      const apiError = err as ApiError
      if (apiError.retryAfter) {
        startResendCooldown(apiError.retryAfter)
      }
      setError(apiError.message || t('errors.generic'))
    } finally {
      setPending('idle')
    }
  }

  if (step === 'otp') {
    const focusOtpInput = (index: number) => {
      otpInputRefs.current[index]?.focus()
      otpInputRefs.current[index]?.select()
    }

    const updateOtpValue = (next: string) => {
      setOtp(next.replace(/\D/g, '').slice(0, OTP_LENGTH))
      clearFieldError('otp')
    }

    const handleOtpDigitChange = (index: number, raw: string) => {
      const digits = raw.replace(/\D/g, '')
      if (!digits) {
        const chars = Array.from({ length: OTP_LENGTH }, (_, i) => otp[i] ?? '')
        chars[index] = ''
        updateOtpValue(chars.join(''))
        return
      }

      if (digits.length > 1) {
        const merged = (otp.slice(0, index) + digits).replace(/\D/g, '').slice(0, OTP_LENGTH)
        updateOtpValue(merged)
        focusOtpInput(Math.min(merged.length, OTP_LENGTH - 1))
        return
      }

      const chars = Array.from({ length: OTP_LENGTH }, (_, i) => otp[i] ?? '')
      chars[index] = digits
      const next = chars.join('').replace(/\s/g, '')
      updateOtpValue(next)
      if (index < OTP_LENGTH - 1) focusOtpInput(index + 1)
    }

    const handleOtpKeyDown = (
      index: number,
      event: React.KeyboardEvent<HTMLInputElement>
    ) => {
      if (event.key !== 'Backspace') return

      if (otp[index]) {
        event.preventDefault()
        const chars = Array.from({ length: OTP_LENGTH }, (_, i) => otp[i] ?? '')
        chars[index] = ''
        updateOtpValue(chars.join(''))
        return
      }

      if (index > 0) {
        event.preventDefault()
        const chars = Array.from({ length: OTP_LENGTH }, (_, i) => otp[i] ?? '')
        chars[index - 1] = ''
        updateOtpValue(chars.join(''))
        focusOtpInput(index - 1)
      }
    }

    const handleOtpPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
      event.preventDefault()
      const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
      if (!pasted) return
      updateOtpValue(pasted)
      focusOtpInput(Math.min(pasted.length, OTP_LENGTH - 1))
    }

    return (
      <AuthLayout branding={<AuthBranding variant="otp" />}>
        <form
          className={cn('flex w-full min-w-0 flex-col', className)}
          onSubmit={handleVerifyOtp}
          noValidate
          aria-busy={isPending}
          aria-describedby={error ? formErrorId : undefined}
          {...props}
        >
          <FieldGroup className="gap-8">
            <div className="flex flex-col gap-3 text-left">
              <h1 className="font-display text-[1.75rem] leading-8 tracking-tight text-ink sm:text-2xl">
                {t('otpTitle')}
              </h1>
              <p className="text-sm leading-6 text-pretty break-words text-body">
                {email ? t('otpSubtitleWithEmail', { email }) : t('otpSubtitle')}
              </p>
              <button
                type="button"
                disabled={isPending}
                className="inline-flex items-center gap-1 self-start rounded-sm text-xs leading-4 font-medium text-mute transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50"
                onClick={() => {
                  setStep('register')
                  setOtp('')
                  setError(null)
                  setFieldErrors({})
                }}
              >
                {t('changeEmail')}
              </button>
            </div>

            <Field data-invalid={fieldErrors.otp ? true : undefined} className="gap-3">
              <FieldLabel htmlFor={otpId} className="text-sm font-medium leading-5 text-ink">
                {t('otpLabel')}
              </FieldLabel>
              <div
                className="flex w-full items-center justify-between gap-2 sm:gap-2.5"
                role="group"
                aria-labelledby={otpId}
                onPaste={handleOtpPaste}
              >
                {Array.from({ length: OTP_LENGTH }, (_, index) => (
                  <Input
                    key={index}
                    ref={(node) => {
                      otpInputRefs.current[index] = node
                    }}
                    id={index === 0 ? otpId : undefined}
                    name={index === 0 ? 'otp' : undefined}
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    disabled={isPending}
                    aria-label={`${t('otpLabel')} ${index + 1}`}
                    aria-invalid={Boolean(fieldErrors.otp)}
                    aria-describedby={
                      [
                        fieldErrors.otp ? otpErrorId : null,
                        index === 0 ? otpHintId : null,
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    value={otp[index] ?? ''}
                    onChange={(e) => handleOtpDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    onFocus={(e) => e.target.select()}
                    className={cn(
                      authInputClassName,
                      'h-12 w-full min-w-0 max-w-[3.25rem] px-0 text-center text-lg font-semibold tracking-normal sm:h-14 sm:max-w-none sm:text-xl'
                    )}
                  />
                ))}
              </div>
              <FieldDescription id={otpHintId} className="text-xs leading-4 text-mute">
                {t('otpHint')}
              </FieldDescription>
              {fieldErrors.otp ? (
                <FieldError id={otpErrorId} className="text-xs leading-4 text-negative">
                  {fieldErrors.otp}
                </FieldError>
              ) : null}
            </Field>

            <div className="flex flex-col items-center gap-3">
              <div
                className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-canvas px-3.5 py-1.5 text-xs font-medium leading-4 text-body"
                aria-live="polite"
              >
                <Clock3 className="size-3.5 text-mute" aria-hidden />
                {resendCooldown > 0
                  ? t('otpCountdown', { time: formatCountdown(resendCooldown) })
                  : t('otpCountdownReady')}
              </div>

              <button
                type="button"
                className="rounded-sm text-sm leading-5 font-medium text-ink underline underline-offset-4 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50"
                disabled={isPending || resendCooldown > 0}
                aria-busy={pending === 'resend'}
                onClick={() => void handleResendOtp()}
              >
                {pending === 'resend' ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    {t('resendOtp')}
                  </span>
                ) : (
                  t('resendOtp')
                )}
              </button>
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

            <Field className="gap-0">
              <Button
                type="submit"
                disabled={isPending || otp.length !== OTP_LENGTH}
                aria-busy={pending === 'otp'}
                className={authPrimaryButtonClassName}
              >
                {pending === 'otp' ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    <span>{t('verifying')}</span>
                  </>
                ) : (
                  t('verify')
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
      </AuthLayout>
    )
  }

  return (
    <AuthLayout branding={<AuthBranding variant="register" />}>
    <form
      className={cn('flex w-full min-w-0 flex-col', className)}
      onSubmit={handleRegister}
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

        <div className="grid min-w-0 grid-cols-1 gap-8 min-[375px]:grid-cols-2 min-[375px]:gap-4">
          <Field
            data-invalid={fieldErrors.firstname ? true : undefined}
            className="min-w-0 gap-2"
          >
            <FieldLabel
              htmlFor={firstnameId}
              className="text-sm font-medium leading-5 text-ink"
            >
              {t('firstname')}
            </FieldLabel>
            <div className="relative">
              <User
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
                aria-hidden
              />
              <Input
                id={firstnameId}
                name="firstname"
                type="text"
                autoComplete="given-name"
                placeholder="John"
                required
                disabled={isPending}
                aria-invalid={Boolean(fieldErrors.firstname)}
                aria-describedby={fieldErrors.firstname ? firstnameErrorId : undefined}
                className={authInputWithIconClassName}
                value={firstname}
                onChange={(e) => {
                  setFirstname(e.target.value)
                  clearFieldError('firstname')
                }}
              />
            </div>
            {fieldErrors.firstname ? (
              <FieldError id={firstnameErrorId} className="text-xs leading-4 text-negative">
                {fieldErrors.firstname}
              </FieldError>
            ) : null}
          </Field>

          <Field
            data-invalid={fieldErrors.lastname ? true : undefined}
            className="min-w-0 gap-2"
          >
            <FieldLabel
              htmlFor={lastnameId}
              className="text-sm font-medium leading-5 text-ink"
            >
              {t('lastname')}
            </FieldLabel>
            <div className="relative">
              <User
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
                aria-hidden
              />
              <Input
                id={lastnameId}
                name="lastname"
                type="text"
                autoComplete="family-name"
                placeholder="Doe"
                required
                disabled={isPending}
                aria-invalid={Boolean(fieldErrors.lastname)}
                aria-describedby={fieldErrors.lastname ? lastnameErrorId : undefined}
                className={authInputWithIconClassName}
                value={lastname}
                onChange={(e) => {
                  setLastname(e.target.value)
                  clearFieldError('lastname')
                }}
              />
            </div>
            {fieldErrors.lastname ? (
              <FieldError id={lastnameErrorId} className="text-xs leading-4 text-negative">
                {fieldErrors.lastname}
              </FieldError>
            ) : null}
          </Field>
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
              disabled={isPending || emailLocked}
              readOnly={emailLocked}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? emailErrorId : undefined}
              className={authInputWithIconClassName}
              value={email}
              onChange={(e) => {
                if (emailLocked) return
                setEmail(e.target.value)
                clearFieldError('email')
              }}
            />
          </div>
          {fieldErrors.email ? (
            <FieldError id={emailErrorId} className="text-xs leading-4 text-negative">
              {fieldErrors.email}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={fieldErrors.phone ? true : undefined} className="gap-2">
          <FieldLabel htmlFor={phoneId} className="text-sm font-medium leading-5 text-ink">
            {t('phone')}
          </FieldLabel>
          <div className="relative">
            <Phone
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              id={phoneId}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              required
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.phone)}
              aria-describedby={fieldErrors.phone ? phoneErrorId : undefined}
              className={authInputWithIconClassName}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                clearFieldError('phone')
              }}
            />
          </div>
          {fieldErrors.phone ? (
            <FieldError id={phoneErrorId} className="text-xs leading-4 text-negative">
              {fieldErrors.phone}
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
              autoComplete="new-password"
              required
              minLength={8}
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={
                [
                  fieldErrors.password ? passwordErrorId : null,
                  password ? strengthId : null,
                  passwordHintId,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              className={cn(authInputWithIconClassName, 'pr-12')}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                clearFieldError('password')
                if (fieldErrors.confirmPassword && e.target.value === confirmPassword) {
                  clearFieldError('confirmPassword')
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

          <FieldDescription id={passwordHintId} className="text-xs leading-4 text-mute">
            {t('passwordHint')}
          </FieldDescription>

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
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={
                fieldErrors.confirmPassword ? confirmPasswordErrorId : undefined
              }
              className={cn(authInputWithIconClassName, 'pr-12')}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                clearFieldError('confirmPassword')
              }}
            />
            <AuthPasswordToggle
              show={showConfirmPassword}
              disabled={isPending}
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
            disabled={isPending}
            aria-busy={pending === 'register'}
            className={authPrimaryButtonClassName}
          >
            {pending === 'register' ? (
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
            {t('haveAccount')}{' '}
            <Link
              href="/login"
              className="rounded-sm font-medium text-ink underline underline-offset-4 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              {t('signIn')}
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
    </AuthLayout>
  )
}
