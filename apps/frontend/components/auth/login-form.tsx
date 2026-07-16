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

type Mode = 'password' | 'magic'

export function LoginForm({ className, ...props }: React.ComponentProps<'form'>) {
  const t = useTranslations('auth.login')
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleGoogle() {
    setError(null)
    setInfo(null)
    setPending(true)

    try {
      const { data } = await api.auth.google()
      if (data.url) {
        window.location.href = data.url
        return
      }
      setError(t('errors.generic'))
    } catch (err) {
      setError((err as ApiError).message || t('errors.generic'))
    } finally {
      setPending(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    setPending(true)

    try {
      if (mode === 'magic') {
        await api.auth.magicLink({ email })
        setInfo(t('magicSent'))
        return
      }

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
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-balance text-muted-foreground">{t('subtitle')}</p>
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

        {mode === 'password' ? (
          <Field>
            <div className="flex items-center">
              <FieldLabel htmlFor="password">{t('password')}</FieldLabel>
              <button
                type="button"
                className="ml-auto text-sm underline-offset-4 hover:underline"
                onClick={() => {
                  setMode('magic')
                  setError(null)
                  setInfo(null)
                }}
              >
                {t('magicLink')}
              </button>
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
        ) : (
          <FieldDescription>
            {t('magicHint')}{' '}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => {
                setMode('password')
                setError(null)
                setInfo(null)
              }}
            >
              {t('usePassword')}
            </button>
          </FieldDescription>
        )}

        {error ? <p className="text-sm text-destructive text-center">{error}</p> : null}
        {info ? <p className="text-sm text-muted-foreground text-center">{info}</p> : null}

        <Field>
          <Button type="submit" disabled={pending}>
            {pending
              ? mode === 'magic'
                ? t('sending')
                : t('submitting')
              : mode === 'magic'
                ? t('sendMagic')
                : t('submit')}
          </Button>
        </Field>

        <FieldSeparator>{t('orContinue')}</FieldSeparator>

        <Field>
          <Button variant="outline" type="button" disabled={pending} onClick={() => void handleGoogle()}>
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
