'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Mail, Phone, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ASSIGNABLE_ROLES,
  isValidEmail,
  isValidPhone,
  type AssignableRole,
} from '@/lib/onboarding'
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

type InviteMemberFormProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FieldErrors = {
  email?: string
  phone?: string
  role?: string
}

/**
 * Invite Member sheet — UI ready for future invitation API.
 * Owner is intentionally omitted from the role dropdown.
 */
export function InviteMemberSheet({ open, onOpenChange }: InviteMemberFormProps) {
  const t = useTranslations('dashboard.team.invite')
  const emailId = useId()
  const phoneId = useId()
  const roleId = useId()
  const formErrorId = useId()

  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<AssignableRole>('agent')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function reset() {
    setEmail('')
    setPhone('')
    setRole('agent')
    setFieldErrors({})
    setError(null)
    setPending(false)
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!email.trim()) next.email = t('errors.emailRequired')
    else if (!isValidEmail(email.trim())) next.email = t('errors.emailInvalid')

    if (phone.trim() && !isValidPhone(phone)) {
      next.phone = t('errors.phoneInvalid')
    }

    if (!ASSIGNABLE_ROLES.includes(role)) {
      next.role = t('errors.roleRequired')
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
      // Future: api.invitations.create({ email, phone?, role })
      await new Promise((resolve) => window.setTimeout(resolve, 400))
      setError(t('errors.comingSoon'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <SheetContent
        side="right"
        className="w-[min(100vw,24rem)] border-dash-border bg-canvas p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-dash-border px-5 py-4 text-left">
          <SheetTitle className="font-display text-lg text-ink">{t('title')}</SheetTitle>
          <SheetDescription className="text-sm text-body">{t('subtitle')}</SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-col gap-5 px-5 py-5"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={pending}
        >
          <FieldGroup className="gap-5">
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
                  placeholder={t('phoneOptional')}
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

            <Field data-invalid={fieldErrors.role ? true : undefined} className="gap-2">
              <FieldLabel htmlFor={roleId}>{t('role')}</FieldLabel>
              <select
                id={roleId}
                value={role}
                disabled={pending}
                onChange={(e) => setRole(e.target.value as AssignableRole)}
                className={cn(
                  'h-11 w-full rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
                  'transition-[border-color,box-shadow] duration-200',
                  'hover:border-dash-border-strong',
                  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
                )}
              >
                {ASSIGNABLE_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {t(`roles.${value}`)}
                  </option>
                ))}
              </select>
              <FieldDescription>{t('roleHint')}</FieldDescription>
              {fieldErrors.role ? <FieldError>{fieldErrors.role}</FieldError> : null}
            </Field>
          </FieldGroup>

          {error ? (
            <div
              id={formErrorId}
              role="alert"
              className="rounded-xl border border-dash-border bg-dash-surface px-3.5 py-3 text-sm text-body"
            >
              {error}
            </div>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full gap-2">
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <UserPlus className="size-4" aria-hidden />
            )}
            {pending ? t('submitting') : t('submit')}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
