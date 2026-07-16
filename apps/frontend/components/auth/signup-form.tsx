'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { FcGoogle } from 'react-icons/fc'
import { cn } from '@/lib/utils'
import { api, type ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Link, useRouter } from '@/i18n/navigation'

type Step = 'register' | 'otp'

export function SignupForm({ className, ...props }: React.ComponentProps<'form'>) {
  const t = useTranslations('auth.register')
  const router = useRouter()

  const [step, setStep] = useState<Step>('register')
  const [firstname, setFirstname] = useState('')
  const [lastname, setLastname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleGoogle() {
    setError(null)
    setPending(true)

    try {
      const { data } = await api.auth.google()
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
      setPending(false)
    }
  }

  async function handleRegister(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError(t('errors.passwordMismatch'))
      return
    }

    if (password.length < 8) {
      setError(t('errors.passwordLength'))
      return
    }

    setPending(true)

    try {
      await api.auth.signup({ firstname, lastname, email, password })
      setStep('otp')
    } catch (err) {
      const apiError = err as ApiError
      if (apiError.code === 'EMAIL_ALREADY_EXISTS') {
        setError(t('errors.emailExists'))
      } else {
        setError(apiError.message || t('errors.generic'))
      }
    } finally {
      setPending(false)
    }
  }

  async function handleVerifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      await api.auth.verifyOtp({ email, otp, password })
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError((err as ApiError).message || t('errors.generic'))
    } finally {
      setPending(false)
    }
  }

  async function handleResendOtp() {
    setError(null)
    setPending(true)

    try {
      await api.auth.resendOtp({ email })
    } catch (err) {
      setError((err as ApiError).message || t('errors.generic'))
    } finally {
      setPending(false)
    }
  }

  if (step === 'otp') {
    return (
      <form className={cn('flex flex-col gap-6', className)} onSubmit={handleVerifyOtp} {...props}>
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors self-start"
          onClick={() => {
            setStep('register')
            setOtp('')
            setError(null)
          }}
        >
          ← {t('back')}
        </button>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">{t('otpTitle')}</h1>
            <p className="text-sm text-balance text-muted-foreground">
              {t('otpSubtitle', { email })}
            </p>
          </div>

          <Field>
            <FieldLabel htmlFor="otp">{t('otpLabel')}</FieldLabel>
            <Input
              id="otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              required
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="bg-background tracking-widest text-center text-lg"
            />
          </Field>

          {error ? <p className="text-sm text-destructive text-center">{error}</p> : null}

          <Field>
            <Button type="submit" disabled={pending || otp.length !== 6}>
              {pending ? t('verifying') : t('verify')}
            </Button>
          </Field>

          <FieldDescription className="text-center">
            <button
              type="button"
              className="underline underline-offset-4 disabled:opacity-50"
              disabled={pending}
              onClick={() => void handleResendOtp()}
            >
              {t('resendOtp')}
            </button>
          </FieldDescription>
        </FieldGroup>
      </form>
    )
  }

  return (
    <form className={cn('flex flex-col gap-6', className)} onSubmit={handleRegister} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-balance text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="firstname">{t('firstname')}</FieldLabel>
            <Input
              id="firstname"
              name="firstname"
              type="text"
              placeholder="John"
              required
              className="bg-background"
              value={firstname}
              onChange={(e) => setFirstname(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="lastname">{t('lastname')}</FieldLabel>
            <Input
              id="lastname"
              name="lastname"
              type="text"
              placeholder="Doe"
              required
              className="bg-background"
              value={lastname}
              onChange={(e) => setLastname(e.target.value)}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="email">{t('email')}</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="johndoe@mail.com"
            required
            className="bg-background"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">{t('password')}</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="bg-background"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FieldDescription>{t('passwordHint')}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="confirm-password">{t('confirmPassword')}</FieldLabel>
          <Input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            required
            className="bg-background"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </Field>

        {error ? <p className="text-sm text-destructive text-center">{error}</p> : null}

        <Field>
          <Button type="submit" disabled={pending}>
            {pending ? t('submitting') : t('submit')}
          </Button>
        </Field>

        <FieldSeparator>{t('orContinue')}</FieldSeparator>

        <Field>
          <Button
            variant="outline"
            type="button"
            disabled={pending}
            onClick={() => void handleGoogle()}
          >
            <FcGoogle />
            {t('google')}
          </Button>
          <FieldDescription className="px-6 text-center">
            {t('haveAccount')}{' '}
            <Link href="/login" className="underline underline-offset-4">
              {t('signIn')}
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
