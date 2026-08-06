'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Building2, Loader2, Mail, Phone, User, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, type ApiError } from '@/lib/api'
import { isValidEmail, isValidPhone } from '@/lib/onboarding'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

type AddContactSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

type FieldErrors = {
  phone?: string
  name?: string
  email?: string
  company?: string
}

export function AddContactSheet({ open, onOpenChange, onCreated }: AddContactSheetProps) {
  const t = useTranslations('dashboard.contacts.add')
  const { canCreateContacts, isLoading: orgsLoading } = useOrganizations()
  const phoneId = useId()
  const nameId = useId()
  const emailId = useId()
  const companyId = useId()
  const formErrorId = useId()

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function reset() {
    setPhone('')
    setName('')
    setEmail('')
    setCompany('')
    setFieldErrors({})
    setError(null)
    setSuccess(null)
    setPending(false)
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!phone.trim()) next.phone = t('errors.phoneRequired')
    else if (!isValidPhone(phone)) next.phone = t('errors.phoneInvalid')

    if (email.trim() && !isValidEmail(email.trim())) {
      next.email = t('errors.emailInvalid')
    }

    return next
  }

  function mapCreateError(apiError: ApiError): string {
    if (apiError.status === 401) return t('errors.sessionExpired')
    if (apiError.status === 403 || apiError.code === 'PERMISSION_DENIED') {
      return t('errors.permissionDenied')
    }
    if (apiError.code === 'E_CONTACT_PHONE_EXISTS') return t('errors.phoneExists')
    if (apiError.code === 'E_CONTACT_PHONE_INVALID') return t('errors.phoneInvalid')
    return apiError.message || t('errors.generic')
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const nextErrors = validate()
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    if (!canCreateContacts) {
      setError(t('errors.permissionDenied'))
      return
    }

    const body: {
      phone: string
      name?: string
      email?: string
      company?: string
    } = { phone: phone.trim() }

    if (name.trim()) body.name = name.trim()
    if (email.trim()) body.email = email.trim()
    if (company.trim()) body.company = company.trim()

    setPending(true)
    try {
      await api.contacts.create(body)
      setSuccess(t('success'))
      onCreated?.()
      window.setTimeout(() => {
        reset()
        onOpenChange(false)
      }, 700)
    } catch (err) {
      setError(mapCreateError(err as ApiError))
    } finally {
      setPending(false)
    }
  }

  const submitDisabled = pending || orgsLoading || !canCreateContacts

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[min(90vh,42rem)] gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton>
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle className="font-display text-lg text-ink">{t('title')}</DialogTitle>
          <DialogDescription className="text-sm text-body">{t('subtitle')}</DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-5 sm:px-6"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={pending}
          aria-describedby={error ? formErrorId : undefined}
        >
          <FieldGroup className="gap-5">
            <Field data-invalid={fieldErrors.phone ? true : undefined} className="gap-2">
              <FieldLabel htmlFor={phoneId}>{t('phone')}</FieldLabel>
              <div className="relative">
                <Phone
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
                  aria-hidden
                />
                <Input
                  id={phoneId}
                  type="tel"
                  autoComplete="tel"
                  className="pl-10"
                  placeholder={t('phonePlaceholder')}
                  value={phone}
                  disabled={pending}
                  onChange={(e) => {
                    setPhone(e.target.value)
                    setFieldErrors((prev) => ({ ...prev, phone: undefined }))
                  }}
                />
              </div>
              <FieldDescription>{t('phoneHint')}</FieldDescription>
              {fieldErrors.phone ? <FieldError>{fieldErrors.phone}</FieldError> : null}
            </Field>

            <Field data-invalid={fieldErrors.name ? true : undefined} className="gap-2">
              <FieldLabel htmlFor={nameId}>{t('name')}</FieldLabel>
              <div className="relative">
                <User
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
                  aria-hidden
                />
                <Input
                  id={nameId}
                  type="text"
                  autoComplete="name"
                  className="pl-10"
                  placeholder={t('nameOptional')}
                  value={name}
                  disabled={pending}
                  onChange={(e) => {
                    setName(e.target.value)
                    setFieldErrors((prev) => ({ ...prev, name: undefined }))
                  }}
                />
              </div>
            </Field>

            <Field data-invalid={fieldErrors.email ? true : undefined} className="gap-2">
              <FieldLabel htmlFor={emailId}>{t('email')}</FieldLabel>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
                  aria-hidden
                />
                <Input
                  id={emailId}
                  type="email"
                  autoComplete="email"
                  className="pl-10"
                  placeholder={t('emailOptional')}
                  value={email}
                  disabled={pending}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setFieldErrors((prev) => ({ ...prev, email: undefined }))
                  }}
                />
              </div>
              {fieldErrors.email ? <FieldError>{fieldErrors.email}</FieldError> : null}
            </Field>

            <Field data-invalid={fieldErrors.company ? true : undefined} className="gap-2">
              <FieldLabel htmlFor={companyId}>{t('company')}</FieldLabel>
              <div className="relative">
                <Building2
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
                  aria-hidden
                />
                <Input
                  id={companyId}
                  type="text"
                  autoComplete="organization"
                  className="pl-10"
                  placeholder={t('companyOptional')}
                  value={company}
                  disabled={pending}
                  onChange={(e) => {
                    setCompany(e.target.value)
                    setFieldErrors((prev) => ({ ...prev, company: undefined }))
                  }}
                />
              </div>
            </Field>
          </FieldGroup>

          {error ? (
            <div
              id={formErrorId}
              role="alert"
              className="rounded-xl border border-negative/25 bg-negative/5 px-3 py-2 text-sm text-negative"
            >
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-xl border border-primary/30 bg-primary-pale/50 px-3 py-2 text-sm text-positive-deep">
              {success}
            </div>
          ) : null}

          <Button type="submit" disabled={submitDisabled} className={cn('gap-2')}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t('submitting')}
              </>
            ) : (
              <>
                <UserPlus className="size-4" aria-hidden />
                {t('submit')}
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
