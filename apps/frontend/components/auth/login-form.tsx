'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
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

export function LoginForm({ className, ...props }: React.ComponentProps<'form'>) {
  const t = useTranslations('auth.login')
  const locale = useLocale()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleGoogle() {
    setError(null)
    setPending(true)

    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      const { data } = await api.auth.google(`${appUrl}/${locale}/dashboard`)
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      await api.auth.login({ email, password })
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError((err as ApiError).message || t('errors.generic'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className={cn('flex flex-col gap-6', className)} onSubmit={handleSubmit} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-display text-2xl text-ink">{t('title')}</h1>
          <p className="text-sm text-balance text-body">{t('subtitle')}</p>
        </div>

        <Field>
          <FieldLabel htmlFor="email">{t('email')}</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="johndoe@mail.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">{t('password')}</FieldLabel>
            <Link
              href="/forgot-password"
              className="ml-auto text-sm underline-offset-4 hover:underline"
            >
              {t('forgotPassword')}
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          <FieldDescription className="text-center">
            {t('noAccount')}{' '}
            <Link href="/register" className="underline underline-offset-4">
              {t('signUp')}
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
