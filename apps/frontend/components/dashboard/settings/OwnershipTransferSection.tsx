'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { ArrowRightLeft, Loader2 } from 'lucide-react'
import {
  api,
  type ApiError,
  type OrganizationMember,
} from '@/lib/api'
import { ASSIGNABLE_ROLES, type AssignableRole } from '@/lib/onboarding'
import { cn } from '@/lib/utils'
import {
  organizationQueryKeys,
  useOrganizations,
} from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { authInputClassName } from '@/components/auth/auth-field-styles'

function unwrapMembers(data: unknown): OrganizationMember[] {
  if (!data) return []
  if (Array.isArray(data)) return data as OrganizationMember[]
  if (typeof data === 'object' && data !== null && 'data' in data) {
    const wrapped = data as { data?: OrganizationMember[] }
    if (Array.isArray(wrapped.data)) return wrapped.data
  }
  return []
}

const selectClassName = cn(
  authInputClassName,
  'h-11 w-full appearance-none rounded-xl px-3.5 text-sm text-ink outline-none'
)

const textareaClassName = cn(
  authInputClassName,
  'min-h-24 w-full resize-y rounded-xl px-3.5 py-2.5 text-sm text-ink outline-none'
)

export function OwnershipTransferSection() {
  const t = useTranslations('dashboard.settings.ownership')
  const queryClient = useQueryClient()
  const {
    accessContext,
    canViewTeam,
    refresh,
    tenantOrganizationId,
  } = useOrganizations()

  const [targetMemberId, setTargetMemberId] = useState('')
  const [replacementRole, setReplacementRole] = useState<AssignableRole>('admin')
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isOwner = Boolean(accessContext?.isOwner)
  const currentMemberId = accessContext?.memberId ?? null

  const membersQuery = useQuery({
    queryKey: [...organizationQueryKeys.all, 'ownership-members', tenantOrganizationId],
    enabled: Boolean(tenantOrganizationId) && isOwner && canViewTeam,
    queryFn: async () => {
      const { data } = await api.members.list()
      return unwrapMembers(data)
    },
  })

  const eligibleMembers = useMemo(() => {
    const rows = membersQuery.data ?? []
    return rows.filter((member) => {
      if (currentMemberId && member.id === currentMemberId) return false
      if (member.role === 'owner') return false
      return true
    })
  }, [membersQuery.data, currentMemberId])

  const selectedMember = eligibleMembers.find((member) => member.id === targetMemberId) ?? null

  const canSubmit =
    Boolean(targetMemberId) &&
    Boolean(selectedMember) &&
    reason.trim().length >= 5 &&
    !membersQuery.isLoading

  const transferMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.ownership.transfer({
        targetMemberId,
        replacementRoleForCurrentOwner: replacementRole,
        reason: reason.trim(),
      })
      return data
    },
    onSuccess: async () => {
      setConfirmOpen(false)
      setError(null)
      setSuccess(t('success', { name: selectedMember?.name || selectedMember?.email || '' }))
      setTargetMemberId('')
      setReason('')
      setReplacementRole('admin')
      await queryClient.invalidateQueries({ queryKey: organizationQueryKeys.all })
      await refresh()
    },
    onError: (err) => {
      const apiError = err as unknown as ApiError
      if (apiError.code === 'NOT_OWNER') {
        setError(t('errors.notOwner'))
      } else if (apiError.code === 'E_OWNERSHIP_SAME_MEMBER') {
        setError(t('errors.sameMember'))
      } else {
        setError(apiError.message || t('errors.transferFailed'))
      }
    },
  })

  if (!isOwner) return null

  function openConfirm() {
    setError(null)
    setSuccess(null)
    setReasonError(null)
    if (!selectedMember) return
    if (reason.trim().length < 5) {
      setReasonError(t('errors.reasonTooShort'))
      return
    }
    if (reason.trim().length > 500) {
      setReasonError(t('errors.reasonTooLong'))
      return
    }
    setConfirmOpen(true)
  }

  return (
    <>
      <DashboardPanel as="section" className="border-warning/25 p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader title={t('title')} description={t('description')} />

        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-dash-border bg-dash-surface/40 px-4 py-3 text-sm">
            <p className="text-xs font-semibold tracking-wide text-mute uppercase">
              {t('currentOwner')}
            </p>
            <p className="mt-1 font-medium text-ink">
              {accessContext?.displayName || t('currentOwnerFallback')}
            </p>
            <p className="mt-0.5 text-xs text-mute">{t('currentOwnerRole')}</p>
          </div>

          {!canViewTeam ? (
            <p role="alert" className="text-sm text-negative">
              {t('errors.membersPermission')}
            </p>
          ) : membersQuery.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-body">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t('loadingMembers')}
            </div>
          ) : membersQuery.isError ? (
            <p role="alert" className="text-sm text-negative">
              {(membersQuery.error as unknown as ApiError)?.message || t('errors.loadMembers')}
            </p>
          ) : eligibleMembers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-dash-border bg-dash-surface/40 px-4 py-3 text-sm text-body">
              {t('noEligibleMembers')}
            </p>
          ) : (
            <FieldGroup className="gap-4">
              <Field className="gap-2">
                <FieldLabel>{t('newOwner')}</FieldLabel>
                <select
                  className={selectClassName}
                  value={targetMemberId}
                  onChange={(e) => {
                    setTargetMemberId(e.target.value)
                    setSuccess(null)
                    setError(null)
                  }}
                >
                  <option value="">{t('newOwnerPlaceholder')}</option>
                  {eligibleMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name || member.email} ({member.role}) — {member.email}
                    </option>
                  ))}
                </select>
                <FieldDescription>{t('newOwnerHint')}</FieldDescription>
              </Field>

              <Field className="gap-2">
                <FieldLabel>{t('replacementRole')}</FieldLabel>
                <select
                  className={selectClassName}
                  value={replacementRole}
                  onChange={(e) => setReplacementRole(e.target.value as AssignableRole)}
                >
                  {ASSIGNABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {t(`roles.${role}`)}
                    </option>
                  ))}
                </select>
                <FieldDescription>{t('replacementRoleHint')}</FieldDescription>
              </Field>

              <Field data-invalid={Boolean(reasonError)} className="gap-2">
                <FieldLabel>{t('reason')}</FieldLabel>
                <textarea
                  className={textareaClassName}
                  value={reason}
                  maxLength={500}
                  placeholder={t('reasonPlaceholder')}
                  onChange={(e) => {
                    setReason(e.target.value)
                    setReasonError(null)
                  }}
                />
                <FieldDescription>{t('reasonHint')}</FieldDescription>
                {reasonError ? <FieldError>{reasonError}</FieldError> : null}
              </Field>
            </FieldGroup>
          )}

          {error ? (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          ) : null}

          {success ? (
            <p
              role="status"
              className="rounded-xl border border-primary/30 bg-primary-pale/50 px-3.5 py-3 text-sm text-positive-deep"
            >
              {success}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-warning/40 text-ink hover:bg-warning/10"
              disabled={!canSubmit || transferMutation.isPending}
              onClick={openConfirm}
            >
              <ArrowRightLeft className="size-4" aria-hidden />
              {t('transferCta')}
            </Button>
          </div>
        </div>
      </DashboardPanel>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!transferMutation.isPending) setConfirmOpen(false)
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ownership-transfer-title"
            aria-describedby="ownership-transfer-desc"
            className="w-full max-w-md rounded-2xl border border-dash-border bg-canvas p-5 shadow-[0_20px_50px_rgb(15_23_42/0.18)] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="ownership-transfer-title"
              className="font-display text-lg tracking-tight text-ink"
            >
              {t('confirmTitle')}
            </h2>
            <p id="ownership-transfer-desc" className="mt-2 text-sm leading-6 text-body">
              {t('confirmBody', {
                name: selectedMember?.name || selectedMember?.email || '',
              })}
            </p>
            <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-ink">
              {t('confirmWarning')}
            </p>

            {error && confirmOpen ? (
              <p role="alert" className="mt-3 text-sm text-negative">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={transferMutation.isPending}
                onClick={() => setConfirmOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={transferMutation.isPending}
                className="gap-2"
                onClick={() => {
                  setError(null)
                  transferMutation.mutate()
                }}
              >
                {transferMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('transferring')}
                  </>
                ) : (
                  t('confirmTransfer')
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
