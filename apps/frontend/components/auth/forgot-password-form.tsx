'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { api, type ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

export function ForgotPasswordForm({ className, ...props }: React.ComponentProps<'form'>) {
  const t = useTranslations('auth.forgotPassword')
  const locale = useLocale()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      await api.auth.forgotPassword({
        email,
        redirectTo: `${appUrl}/${locale}/reset-password`,
      })
      setSent(true)
    } catch (err) {
      const apiError = err as ApiError
      if (apiError.code === 'USE_GOOGLE_SIGN_IN') {
        setError(t('errors.useGoogle'))
      } else {
        setError(apiError.message || t('errors.generic'))
      }
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold">{t('sentTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('sentSubtitle', { email })}</p>
        </div>
        <FieldDescription className="text-center">
          <Link href="/login" className="underline underline-offset-4">
            {t('backToLogin')}
          </Link>
        </FieldDescription>
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
          <FieldLabel htmlFor="fp-email">{t('email')}</FieldLabel>
          <Input
            id="fp-email"
            name="email"
            type="email"
            placeholder="johndoe@mail.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        {error ? <p className="text-sm text-destructive text-center">{error}</p> : null}

        <Field>
          <Button type="submit" disabled={pending}>
            {pending ? t('submitting') : t('submit')}
          </Button>
        </Field>

        <FieldDescription className="text-center">
          <Link href="/login" className="underline underline-offset-4">
            {t('backToLogin')}
          </Link>
        </FieldDescription>
      </FieldGroup>
    </form>
  )
}
