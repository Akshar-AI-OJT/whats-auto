'use client'

import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import {
  api,
  type ApiError,
  type OrganizationAdminUser,
  type UpdateOrganizationAdminUserBody,
} from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { isValidEmail } from '@/lib/onboarding'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type EditOrgAdminUserDialogProps = {
  open: boolean
  userId: string | null
  onOpenChange: (open: boolean) => void
  /** Called after a successful profile update so the parent list can refresh. */
  onUpdated?: (user: OrganizationAdminUser) => void
}

type FieldErrors = {
  firstname?: string
  lastname?: string
  email?: string
}

type FormState = {
  firstname: string
  lastname: string
  email: string
  isActive: boolean
}

function unwrapUser(data: unknown): OrganizationAdminUser | null {
  if (!data || typeof data !== 'object') return null
  if ('id' in data && 'email' in data) return data as OrganizationAdminUser
  const wrapped = data as { data?: OrganizationAdminUser }
  return wrapped.data ?? null
}

function formFromUser(user: OrganizationAdminUser): FormState {
  return {
    firstname: user.firstname?.trim() || '',
    lastname: user.lastname?.trim() || '',
    email: user.email.trim(),
    isActive: user.isActive !== false,
  }
}

/**
 * Edit org-admin user profile via GET/PATCH /api/v1/organization-admin/users/:id.
 * Owner/Admin only (same gate as listUsers). Role changes stay on members API.
 */
export function EditOrgAdminUserDialog({
  open,
  userId,
  onOpenChange,
  onUpdated,
}: EditOrgAdminUserDialogProps) {
  const t = useTranslations('dashboard.team.editUser')
  const tErrors = useTranslations('dashboard.team.errors')
  const { tenantOrganizationId } = useOrganizations()
  const queryClient = useQueryClient()

  const firstnameId = useId()
  const lastnameId = useId()
  const emailId = useId()
  const activeId = useId()
  const formErrorId = useId()

  const [form, setForm] = useState<FormState>({
    firstname: '',
    lastname: '',
    email: '',
    isActive: true,
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: queryKeys.team.userDetail(tenantOrganizationId, userId),
    queryFn: async () => {
      const { data } = await api.organizationAdmin.getUser(userId!)
      const user = unwrapUser(data)
      if (!user) throw new Error(t('errors.loadFailed'))
      return user
    },
    enabled: open && Boolean(tenantOrganizationId) && Boolean(userId),
  })

  // Hydrate form when detail loads / user changes (render-time — no syncing effect).
  const loadedUser = detailQuery.data ?? null
  const loadedKey = loadedUser ? `${loadedUser.id}:${loadedUser.updatedAt ?? ''}` : null
  if (open && loadedUser && loadedKey && hydratedUserId !== loadedKey) {
    setHydratedUserId(loadedKey)
    setForm(formFromUser(loadedUser))
    setFieldErrors({})
    setFormError(null)
  }
  if (!open && hydratedUserId !== null) {
    setHydratedUserId(null)
    setFieldErrors({})
    setFormError(null)
  }

  const updateMutation = useMutation({
    mutationFn: async (body: UpdateOrganizationAdminUserBody) => {
      const { data } = await api.organizationAdmin.updateUser(userId!, body)
      const user = unwrapUser(data)
      if (!user) throw new Error(t('errors.saveFailed'))
      return user
    },
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.team.all(tenantOrganizationId),
      })
      onUpdated?.(user)
      onOpenChange(false)
    },
    onError: (err) => {
      setFormError(
        mapUpdateError(err as unknown as ApiError, {
          sessionExpired: tErrors('sessionExpired'),
          permissionDenied: tErrors('actionPermissionDenied'),
          emailExists: t('errors.emailExists'),
          notFound: t('errors.notFound'),
          saveFailed: t('errors.saveFailed'),
        })
      )
    },
  })

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!form.firstname.trim()) next.firstname = t('errors.firstnameRequired')
    if (!form.lastname.trim()) next.lastname = t('errors.lastnameRequired')
    if (!form.email.trim()) next.email = t('errors.emailRequired')
    else if (!isValidEmail(form.email.trim())) next.email = t('errors.emailInvalid')
    return next
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!userId || updateMutation.isPending) return
    const nextErrors = validate()
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const baseline = loadedUser ? formFromUser(loadedUser) : null
    const body: UpdateOrganizationAdminUserBody = {}
    if (!baseline || form.firstname.trim() !== baseline.firstname) {
      body.firstname = form.firstname.trim()
    }
    if (!baseline || form.lastname.trim() !== baseline.lastname) {
      body.lastname = form.lastname.trim()
    }
    if (!baseline || form.email.trim() !== baseline.email) {
      body.email = form.email.trim()
    }
    if (!baseline || form.isActive !== baseline.isActive) {
      body.isActive = form.isActive
    }

    if (Object.keys(body).length === 0) {
      onOpenChange(false)
      return
    }

    setFormError(null)
    updateMutation.mutate(body)
  }

  const pending = updateMutation.isPending
  const loadingDetail = detailQuery.isLoading || detailQuery.isFetching

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        if (!next) updateMutation.reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        {loadingDetail && !loadedUser ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : detailQuery.isError && !loadedUser ? (
          <div className="space-y-4 px-5 py-6 sm:px-6">
            <p role="alert" className="text-sm text-negative">
              {(detailQuery.error as unknown as ApiError)?.message || t('errors.loadFailed')}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('cancel')}
              </Button>
              <Button type="button" onClick={() => void detailQuery.refetch()}>
                {t('retry')}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-5 sm:px-6" noValidate>
            <FieldGroup className="gap-4">
              <Field data-invalid={Boolean(fieldErrors.firstname) || undefined}>
                <FieldLabel htmlFor={firstnameId}>{t('firstname')}</FieldLabel>
                <Input
                  id={firstnameId}
                  value={form.firstname}
                  disabled={pending}
                  maxLength={100}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, firstname: e.target.value }))
                    setFieldErrors((prev) => ({ ...prev, firstname: undefined }))
                  }}
                />
                {fieldErrors.firstname ? <FieldError>{fieldErrors.firstname}</FieldError> : null}
              </Field>

              <Field data-invalid={Boolean(fieldErrors.lastname) || undefined}>
                <FieldLabel htmlFor={lastnameId}>{t('lastname')}</FieldLabel>
                <Input
                  id={lastnameId}
                  value={form.lastname}
                  disabled={pending}
                  maxLength={100}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, lastname: e.target.value }))
                    setFieldErrors((prev) => ({ ...prev, lastname: undefined }))
                  }}
                />
                {fieldErrors.lastname ? <FieldError>{fieldErrors.lastname}</FieldError> : null}
              </Field>

              <Field data-invalid={Boolean(fieldErrors.email) || undefined}>
                <FieldLabel htmlFor={emailId}>{t('email')}</FieldLabel>
                <Input
                  id={emailId}
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  disabled={pending}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, email: e.target.value }))
                    setFieldErrors((prev) => ({ ...prev, email: undefined }))
                  }}
                />
                {fieldErrors.email ? <FieldError>{fieldErrors.email}</FieldError> : null}
              </Field>

              <label
                htmlFor={activeId}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border border-dash-border bg-dash-surface/50 px-3 py-3',
                  pending && 'cursor-not-allowed opacity-60'
                )}
              >
                <input
                  id={activeId}
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-dash-border"
                  checked={form.isActive}
                  disabled={pending}
                  onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{t('isActive')}</span>
                  <span className="mt-0.5 block text-xs text-mute">{t('isActiveHint')}</span>
                </span>
              </label>
            </FieldGroup>

            {formError ? (
              <p
                id={formErrorId}
                role="alert"
                className="mt-4 rounded-xl border border-negative/25 bg-negative/5 px-3 py-2 text-sm text-negative"
              >
                {formError}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-dash-border pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => onOpenChange(false)}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={pending || loadingDetail} className="gap-2">
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {pending ? t('saving') : t('save')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function mapUpdateError(
  err: ApiError,
  messages: {
    sessionExpired: string
    permissionDenied: string
    emailExists: string
    notFound: string
    saveFailed: string
  }
) {
  if (err.status === 401) return messages.sessionExpired
  if (err.status === 403) return messages.permissionDenied
  if (err.code === 'EMAIL_ALREADY_EXISTS' || /already exists/i.test(err.message || '')) {
    return messages.emailExists
  }
  if (err.code === 'E_USER_NOT_FOUND') return messages.notFound
  return err.message || messages.saveFailed
}
