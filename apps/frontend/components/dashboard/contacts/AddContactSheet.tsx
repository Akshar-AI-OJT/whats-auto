'use client'

import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Building2, Loader2, Mail, Pencil, Phone, User, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  api,
  type ApiError,
  type ContactSummary,
  type CreateContactBody,
  type UpdateContactBody,
} from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isValidEmail } from '@/lib/onboarding'
import { isInternationalContactPhone } from '@/lib/contact-phone'
import { COUNTRY_OPTIONS } from '@/components/onboarding/organization-wizard-types'
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
  contact?: ContactSummary | null
  onSaved?: () => void
}

type FieldErrors = {
  phone?: string
  countryCode?: string
  name?: string
  email?: string
  company?: string
}

function unwrapContact(data: unknown): ContactSummary {
  if (!data || typeof data !== 'object') {
    throw new Error('Contact payload missing')
  }
  const root = data as { data?: ContactSummary } & ContactSummary
  const contact =
    root.data && typeof root.data === 'object' && typeof root.data.id === 'string'
      ? root.data
      : root
  if (typeof contact.id !== 'string' || !contact.id) {
    throw new Error('Contact payload missing id')
  }
  return contact
}

function editPhoneValue(contact: ContactSummary): string {
  const stored = contact.phone?.trim() || ''
  if (stored.startsWith('+')) return stored
  const normalized = contact.phoneNormalized?.replace(/^\+/, '') || ''
  return normalized ? `+${normalized}` : stored
}

export function AddContactSheet({
  open,
  onOpenChange,
  contact = null,
  onSaved,
}: AddContactSheetProps) {
  const isEdit = Boolean(contact)
  const t = useTranslations(isEdit ? 'dashboard.contacts.edit' : 'dashboard.contacts.add')
  const tFields = useTranslations('dashboard.contacts.add')
  const tCountries = useTranslations('onboarding.organization.step2.countries')
  const {
    canCreateContacts,
    canEditContacts,
    tenantOrganizationId,
    isLoading: orgsLoading,
  } = useOrganizations()
  const countryId = useId()
  const phoneId = useId()
  const nameId = useId()
  const emailId = useId()
  const companyId = useId()
  const formErrorId = useId()

  const [countryCode, setCountryCode] = useState('')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const liveQuery = useQuery({
    queryKey: queryKeys.contacts.detail(tenantOrganizationId, contact?.id),
    queryFn: async () => {
      const { data } = await api.contacts.get(contact!.id)
      return unwrapContact(data)
    },
    enabled: open && isEdit && Boolean(contact?.id),
    retry: (failureCount, err) => {
      const status = (err as unknown as ApiError)?.status
      return status !== 404 && status !== 403 && failureCount < 1
    },
  })

  const [formEpoch, setFormEpoch] = useState('closed')
  const source = isEdit ? (liveQuery.data ?? contact) : null
  const nextEpoch = !open
    ? 'closed'
    : isEdit
      ? `${contact?.id ?? 'none'}:${liveQuery.dataUpdatedAt || 'list'}`
      : 'create'

  if (formEpoch !== nextEpoch) {
    setFormEpoch(nextEpoch)
    if (nextEpoch === 'closed' || nextEpoch === 'create') {
      setCountryCode('')
      setPhone('')
      setName('')
      setEmail('')
      setCompany('')
      setFieldErrors({})
      setError(null)
      setSuccess(null)
      setPending(false)
    } else if (source) {
      setCountryCode('')
      setPhone(editPhoneValue(source))
      setName(source.name ?? '')
      setEmail(source.email ?? '')
      setCompany(source.company ?? '')
      setFieldErrors({})
      setError(null)
      setSuccess(null)
      setPending(false)
    }
  }

  function reset() {
    setCountryCode('')
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
    if (!phone.trim()) next.phone = tFields('errors.phoneRequired')
    else if (!isInternationalContactPhone(phone) && !countryCode) {
      next.countryCode = tFields('errors.countryRequired')
    }

    if (email.trim() && !isValidEmail(email.trim())) {
      next.email = tFields('errors.emailInvalid')
    }

    return next
  }

  function mapSaveError(apiError: ApiError): string {
    if (apiError.status === 401) return tFields('errors.sessionExpired')
    if (apiError.status === 403 || apiError.code === 'PERMISSION_DENIED') {
      return t('errors.permissionDenied')
    }
    if (apiError.status === 404 || apiError.code === 'E_CONTACT_NOT_FOUND') {
      return t('errors.notFound')
    }
    if (apiError.code === 'E_CONTACT_PHONE_EXISTS') return tFields('errors.phoneExists')
    if (apiError.code === 'E_CONTACT_PHONE_INVALID') return tFields('errors.phoneInvalid')
    return apiError.message || t('errors.generic')
  }

  const queryError =
    open && isEdit && liveQuery.isError ? mapSaveError(liveQuery.error as unknown as ApiError) : null
  const displayError = error ?? queryError

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const nextErrors = validate()
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    if (isEdit ? !canEditContacts : !canCreateContacts) {
      setError(t('errors.permissionDenied'))
      return
    }

    setPending(true)
    try {
      if (isEdit && contact) {
        const body: UpdateContactBody = {
          phoneNumber: phone.trim(),
          name: name.trim() ? name.trim() : null,
          email: email.trim() ? email.trim() : null,
          company: company.trim() ? company.trim() : null,
        }
        if (countryCode) body.countryCode = countryCode
        await api.contacts.update(contact.id, body)
      } else {
        const body: CreateContactBody = { phoneNumber: phone.trim() }
        if (countryCode) body.countryCode = countryCode
        if (name.trim()) body.name = name.trim()
        if (email.trim()) body.email = email.trim()
        if (company.trim()) body.company = company.trim()
        await api.contacts.create(body)
      }
      setSuccess(t('success'))
      onSaved?.()
      window.setTimeout(() => {
        reset()
        onOpenChange(false)
      }, 700)
    } catch (err) {
      setError(mapSaveError(err as unknown as ApiError))
    } finally {
      setPending(false)
    }
  }

  const canSubmit = isEdit ? canEditContacts : canCreateContacts
  const submitDisabled = pending || orgsLoading || !canSubmit || (isEdit && liveQuery.isError)
  const loadingLive = isEdit && liveQuery.isLoading && !liveQuery.data

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

        {loadingLive ? (
          <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : (
          <form
            className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-5 sm:px-6"
            onSubmit={handleSubmit}
            noValidate
            aria-busy={pending}
            aria-describedby={displayError ? formErrorId : undefined}
          >
            <FieldGroup className="gap-5">
              <Field
                data-invalid={fieldErrors.countryCode ? true : undefined}
                className="gap-2"
              >
                <FieldLabel htmlFor={countryId}>{tFields('country')}</FieldLabel>
                <select
                  id={countryId}
                  value={countryCode}
                  disabled={pending}
                  aria-invalid={fieldErrors.countryCode ? true : undefined}
                  className={cn(
                    'h-12 w-full cursor-pointer appearance-none rounded-md border border-ink bg-canvas px-4 text-base leading-5 text-ink outline-none',
                    'hover:border-body focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-primary/50',
                    'disabled:cursor-not-allowed disabled:border-border disabled:bg-canvas-soft disabled:text-mute',
                    !countryCode && 'text-mute'
                  )}
                  onChange={(e) => {
                    setCountryCode(e.target.value)
                    setFieldErrors((prev) => ({ ...prev, countryCode: undefined }))
                  }}
                >
                  <option value="">{tFields('countryPlaceholder')}</option>
                  {COUNTRY_OPTIONS.map((country) => (
                    <option key={country.code} value={country.code}>
                      {tCountries(country.labelKey)}
                    </option>
                  ))}
                </select>
                {fieldErrors.countryCode ? (
                  <FieldError>{fieldErrors.countryCode}</FieldError>
                ) : null}
              </Field>

              <Field data-invalid={fieldErrors.phone ? true : undefined} className="gap-2">
                <FieldLabel htmlFor={phoneId}>{tFields('phone')}</FieldLabel>
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
                    placeholder={tFields('phonePlaceholder')}
                    value={phone}
                    disabled={pending}
                    onChange={(e) => {
                      setPhone(e.target.value)
                      setFieldErrors((prev) => ({ ...prev, phone: undefined }))
                    }}
                  />
                </div>
                <FieldDescription>{tFields('phoneHint')}</FieldDescription>
                {fieldErrors.phone ? <FieldError>{fieldErrors.phone}</FieldError> : null}
              </Field>

              <Field data-invalid={fieldErrors.name ? true : undefined} className="gap-2">
                <FieldLabel htmlFor={nameId}>{tFields('name')}</FieldLabel>
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
                    placeholder={tFields('nameOptional')}
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
                <FieldLabel htmlFor={emailId}>{tFields('email')}</FieldLabel>
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
                    placeholder={tFields('emailOptional')}
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
                <FieldLabel htmlFor={companyId}>{tFields('company')}</FieldLabel>
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
                    placeholder={tFields('companyOptional')}
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

            {displayError ? (
              <div
                id={formErrorId}
                role="alert"
                className="rounded-xl border border-negative/25 bg-negative/5 px-3 py-2 text-sm text-negative"
              >
                {displayError}
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
                  {isEdit ? (
                    <Pencil className="size-4" aria-hidden />
                  ) : (
                    <UserPlus className="size-4" aria-hidden />
                  )}
                  {t('submit')}
                </>
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
