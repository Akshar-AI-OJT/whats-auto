'use client'

import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Mail, Phone, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, type ApiError } from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

type InviteMemberFormProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful invite — useful for refreshing lists later. */
  onInvited?: () => void
}

type FieldErrors = {
  email?: string
  phone?: string
  role?: string
}

/**
 * Invite Member dialog — creates a pending invitation via
 * POST /api/v1/organizations/:id/invitations.
 * Owner is intentionally omitted from the role dropdown.
 * Phone is collected for UX only; the API accepts email + role.
 */
export function InviteMemberSheet({
  open,
  onOpenChange,
  onInvited,
}: InviteMemberFormProps) {
  const t = useTranslations('dashboard.team.invite')
  const { tenantOrganizationId, canInviteMembers, isLoading: orgsLoading } =
    useOrganizations()
  const emailId = useId()
  const phoneId = useId()
  const roleId = useId()
  const formErrorId = useId()
  const submitLockRef = useRef(false)

  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<AssignableRole>('agent')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function reset() {
    setEmail('')
    setPhone('')
    setRole('agent')
    setFieldErrors({})
    setError(null)
    setSuccess(null)
    setPending(false)
    submitLockRef.current = false
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

  function mapInviteError(apiError: ApiError): string {
    if (apiError.status === 401) return t('errors.sessionExpired')
    if (apiError.status === 403) {
      if (apiError.code === 'ORG_ID_MISMATCH') return t('errors.orgMismatch')
      return t('errors.permissionDenied')
    }
    if (apiError.code === 'E_INVITE_ALREADY_MEMBER') return t('errors.alreadyMember')
    if (apiError.code === 'E_INVITE_ALREADY_PENDING') return t('errors.alreadyPending')
    if (apiError.code === 'E_ROLE_MISSING') return t('errors.roleInvalid')
    if (apiError.code === 'E_INVITE_EMAIL_FAILED') return t('errors.emailFailed')
    if (apiError.status >= 500) return t('errors.generic')
    // Bare fetch fallback ("Request failed") when statusText/body are empty — show generic copy.
    if (!apiError.message || apiError.message === 'Request failed') return t('errors.generic')
    return apiError.message
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const nextErrors = validate()
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    if (!tenantOrganizationId) {
      setError(t('errors.noActiveOrg'))
      return
    }

    if (!canInviteMembers) {
      setError(t('errors.permissionDenied'))
      return
    }

    // Sync lock — React state `pending` alone allows double-submit before re-render.
    if (submitLockRef.current) return
    submitLockRef.current = true

    setPending(true)
    try {
      await api.invitations.create(tenantOrganizationId, {
        email: email.trim(),
        role,
      })
      // 2xx from create means the invite row was accepted — do not re-validate
      // response wrapping here (serialize may nest under `data`).
      setSuccess(t('success'))
      onInvited?.()
      window.setTimeout(() => {
        reset()
        onOpenChange(false)
      }, 700)
    } catch (err) {
      setError(mapInviteError(err as ApiError))
      submitLockRef.current = false
    } finally {
      setPending(false)
    }
  }

  const submitDisabled =
    pending || orgsLoading || !tenantOrganizationId || !canInviteMembers

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
              className="rounded-xl border border-negative/25 bg-negative/5 px-3.5 py-3 text-sm text-negative"
            >
              {error}
            </div>
          ) : null}

          {success ? (
            <div
              role="status"
              className="rounded-xl border border-primary/30 bg-primary-pale/60 px-3.5 py-3 text-sm text-positive-deep"
            >
              {success}
            </div>
          ) : null}

          <Button type="submit" disabled={submitDisabled} className="w-full gap-2">
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <UserPlus className="size-4" aria-hidden />
            )}
            {pending ? t('submitting') : t('submit')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
