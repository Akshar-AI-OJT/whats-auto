'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { api, type ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Link, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

export function ResetPasswordForm({ className, ...props }: React.ComponentProps<'form'>) {
  const t = useTranslations('auth.resetPassword')
  const router = useRouter()
  const searchParams = useSearchParams()

  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError(t('errors.mismatch'))
      return
    }

    if (password.length < 8) {
      setError(t('errors.length'))
      return
    }

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
      <FieldGroup>
        <p className="text-sm text-destructive text-center">{t('errors.invalidToken')}</p>
        <FieldDescription className="text-center">
          <Link href="/forgot-password" className="underline underline-offset-4">
            {t('requestNew')}
          </Link>
        </FieldDescription>
      </FieldGroup>
    )
  }

  if (success) {
    return (
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold">{t('successTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('successSubtitle')}</p>
        </div>
      </FieldGroup>
    )
  }

  return (
    <form className={cn('flex flex-col gap-6', className)} onSubmit={handleSubmit} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <Field>
          <FieldLabel htmlFor="rp-password">{t('password')}</FieldLabel>
          <Input
            id="rp-password"
            name="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="rp-confirm">{t('confirmPassword')}</FieldLabel>
          <Input
            id="rp-confirm"
            name="confirmPassword"
            type="password"
            required
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
      </FieldGroup>
    </form>
  )
}
