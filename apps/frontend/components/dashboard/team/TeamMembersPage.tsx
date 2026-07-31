'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Mail, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/i18n/navigation'
import {
  api,
  type ApiError,
  type OrganizationMember,
  type PendingInvitation,
} from '@/lib/api'
import { ASSIGNABLE_ROLES, type AssignableRole } from '@/lib/onboarding'
import { cn } from '@/lib/utils'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { InviteMemberSheet } from '@/components/dashboard/team/InviteMemberSheet'
import { WorkspaceAvatar } from '@/components/dashboard/WorkspaceSwitcher'

function unwrapList<T>(data: { data?: T[] } | T[] | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.data)) return data.data
  return []
}

function initialsFromName(name: string, email: string) {
  const source = name.trim() || email.trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase() || '?'
}

function roleLabelKey(role: string): 'owner' | 'admin' | 'agent' | 'viewer' | 'other' {
  const normalized = role.toLowerCase()
  if (
    normalized === 'owner' ||
    normalized === 'admin' ||
    normalized === 'agent' ||
    normalized === 'viewer'
  ) {
    return normalized
  }
  return 'other'
}

function isAssignableRole(role: string): role is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role)
}

const roleSelectClassName = cn(
  'h-9 shrink-0 rounded-lg border border-dash-border bg-canvas px-2.5 text-xs font-semibold tracking-wide text-ink uppercase outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30',
  'disabled:cursor-not-allowed disabled:opacity-60'
)

export function TeamMembersPage() {
  const t = useTranslations('dashboard.team')
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const removeTitleId = useId()
  const removeDescId = useId()
  const cancelTitleId = useId()
  const cancelDescId = useId()
  const {
    activeOrganizationId,
    accessContext,
    canViewTeam,
    canInviteMembers,
    canAssignRole,
    canRemoveMember,
    isLoading: orgsLoading,
  } = useOrganizations()

  const inviteFromQuery = searchParams.get('invite') === '1'
  const [inviteForced, setInviteForced] = useState(false)
  const inviteOpen = canInviteMembers && (inviteFromQuery || inviteForced)

  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvitation[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [rolePendingId, setRolePendingId] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<OrganizationMember | null>(null)
  const [removePending, setRemovePending] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<PendingInvitation | null>(null)
  const [cancelPending, setCancelPending] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const loadTeam = useCallback(async () => {
    if (!activeOrganizationId || !canViewTeam) {
      setMembers([])
      setPendingInvites([])
      setListLoading(false)
      return
    }

    setListLoading(true)
    setListError(null)
    try {
      const [membersResult, invitesResult] = await Promise.all([
        api.members.list(),
        api.invitations.list().catch(() => ({ data: [] as PendingInvitation[] })),
      ])
      setMembers(unwrapList(membersResult.data))
      setPendingInvites(unwrapList(invitesResult.data))
    } catch (err) {
      setMembers([])
      setPendingInvites([])
      const apiError = err as ApiError
      setListError(apiError.message || t('errors.loadFailed'))
    } finally {
      setListLoading(false)
    }
  }, [activeOrganizationId, canViewTeam])

  useEffect(() => {
    if (orgsLoading) return
    void loadTeam()
  }, [orgsLoading, loadTeam])

  useEffect(() => {
    if (orgsLoading || canInviteMembers || !inviteFromQuery) return
    router.replace(pathname)
  }, [orgsLoading, canInviteMembers, inviteFromQuery, pathname, router])

  function handleInviteOpenChange(open: boolean) {
    if (open) {
      if (!canInviteMembers) return
      setInviteForced(true)
      return
    }
    setInviteForced(false)
    if (inviteFromQuery) {
      router.replace(pathname)
    }
  }

  function mapMemberActionError(err: unknown): string {
    const apiError = err as ApiError
    if (apiError.status === 401) return t('errors.sessionExpired')
    if (apiError.status === 403 || apiError.code === 'PERMISSION_DENIED') {
      return t('errors.actionPermissionDenied')
    }
    if (apiError.code === 'E_ROLE_SELF_ASSIGN') return t('errors.selfAssign')
    if (apiError.code === 'E_ROLE_CHANGE_OWNER') return t('errors.changeOwner')
    if (apiError.code === 'E_MEMBER_REMOVE_OWNER') return t('errors.removeOwner')
    if (apiError.code === 'E_PERMISSION_ESCALATION') return t('errors.permissionEscalation')
    if (apiError.code === 'E_ROLE_MISSING' || apiError.code === 'E_ROLE_ASSIGN_OWNER') {
      return t('errors.roleInvalid')
    }
    if (apiError.code === 'E_INVITE_NOT_PENDING') return t('errors.inviteNotPending')
    if (apiError.code === 'E_INVITE_NOT_FOUND') return t('errors.inviteNotFound')
    return apiError.message || t('errors.actionFailed')
  }

  async function handleRoleChange(member: OrganizationMember, nextRole: string) {
    if (!canAssignRole || !isAssignableRole(nextRole) || nextRole === member.role) return

    setActionError(null)
    setRolePendingId(member.id)
    // Optimistic UI — revert on failure.
    setMembers((prev) =>
      prev.map((row) => (row.id === member.id ? { ...row, role: nextRole } : row))
    )
    try {
      await api.members.assignRole(member.id, nextRole)
    } catch (err) {
      setMembers((prev) =>
        prev.map((row) => (row.id === member.id ? { ...row, role: member.role } : row))
      )
      setActionError(mapMemberActionError(err))
    } finally {
      setRolePendingId(null)
    }
  }

  async function handleRemoveConfirm() {
    if (!removeTarget || !canRemoveMember) return
    setRemoveError(null)
    setRemovePending(true)
    try {
      await api.members.remove(removeTarget.id)
      setMembers((prev) => prev.filter((row) => row.id !== removeTarget.id))
      setRemoveTarget(null)
      setActionError(null)
    } catch (err) {
      setRemoveError(mapMemberActionError(err))
    } finally {
      setRemovePending(false)
    }
  }

  async function handleCancelInviteConfirm() {
    if (!cancelTarget || !canInviteMembers) return
    setCancelError(null)
    setCancelPending(true)
    try {
      await api.invitations.cancel(cancelTarget.id)
      setPendingInvites((prev) => prev.filter((row) => row.id !== cancelTarget.id))
      setCancelTarget(null)
      setActionError(null)
    } catch (err) {
      setCancelError(mapMemberActionError(err))
    } finally {
      setCancelPending(false)
    }
  }

  const showEmpty = !listLoading && !listError && members.length === 0
  const currentMemberId = accessContext?.memberId ?? null

  if (!orgsLoading && !canViewTeam) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6">
        <DashboardPanel as="section" className="px-4 py-5 sm:px-6 sm:py-6">
          <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
            {t('title')}
          </h1>
          <div
            role="alert"
            className="mt-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink"
          >
            {t('errors.permissionDenied')}
          </div>
        </DashboardPanel>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6">
      <DashboardPanel
        as="section"
        className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
      >
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
              {t('eyebrow')}
            </p>
            <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-body sm:text-base sm:leading-7">
              {t('subtitle')}
            </p>
          </div>
          {canInviteMembers ? (
            <Button
              type="button"
              className="shrink-0 gap-2"
              onClick={() => setInviteForced(true)}
            >
              <UserPlus className="size-4" aria-hidden />
              {t('inviteCta')}
            </Button>
          ) : null}
        </div>
      </DashboardPanel>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader
          title={t('membersTitle')}
          description={t('membersDescription')}
        />

        {actionError ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
          >
            {actionError}
          </div>
        ) : null}

        {listLoading || orgsLoading ? (
          <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-body">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : listError ? (
          <div
            role="alert"
            className="mt-8 rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
          >
            {listError}
          </div>
        ) : showEmpty ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border bg-dash-surface/50 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
              <Users className="size-5" aria-hidden />
            </span>
            <p className="font-medium text-ink">{t('emptyTitle')}</p>
            <p className="max-w-sm text-sm text-body">{t('emptyDescription')}</p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-dash-border overflow-hidden rounded-2xl border border-dash-border">
            {members.map((member) => {
              const roleKey = roleLabelKey(member.role)
              const isOwner = member.role.toLowerCase() === 'owner'
              const isSelf = Boolean(currentMemberId && member.id === currentMemberId)
              const canEditRole =
                canAssignRole && !isOwner && !isSelf && isAssignableRole(member.role)
              const canRemove = canRemoveMember && !isOwner && !isSelf
              const roleBusy = rolePendingId === member.id

              return (
                <li
                  key={member.id}
                  className="flex flex-col gap-3 bg-canvas px-4 py-3.5 sm:flex-row sm:items-center sm:gap-3 sm:px-5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <WorkspaceAvatar
                      initials={initialsFromName(member.name, member.email)}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">
                        {member.name.trim() || member.email}
                        {isSelf ? (
                          <span className="ml-1.5 text-xs font-normal text-mute">
                            ({t('you')})
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-sm text-body">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                    {canEditRole ? (
                      <div className="relative">
                        <select
                          aria-label={t('changeRoleAria', {
                            name: member.name.trim() || member.email,
                          })}
                          className={roleSelectClassName}
                          value={member.role}
                          disabled={roleBusy || Boolean(rolePendingId)}
                          onChange={(e) => {
                            void handleRoleChange(member, e.target.value)
                          }}
                        >
                          {ASSIGNABLE_ROLES.map((value) => (
                            <option key={value} value={value}>
                              {t(`roles.${value}`)}
                            </option>
                          ))}
                        </select>
                        {roleBusy ? (
                          <Loader2
                            className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 animate-spin text-mute"
                            aria-hidden
                          />
                        ) : null}
                      </div>
                    ) : (
                      <span className="rounded-md bg-dash-surface px-2.5 py-1 text-xs font-semibold tracking-wide text-positive-deep uppercase">
                        {roleKey === 'other' ? member.role : t(`roles.${roleKey}`)}
                      </span>
                    )}

                    {canRemove ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 border-negative/30 text-negative hover:bg-negative/5 hover:text-negative"
                        aria-label={t('removeAria', {
                          name: member.name.trim() || member.email,
                        })}
                        disabled={removePending}
                        onClick={() => {
                          setRemoveError(null)
                          setRemoveTarget(member)
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </DashboardPanel>

      {!listLoading && !listError && pendingInvites.length > 0 ? (
        <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
          <DashboardSectionHeader
            title={t('pendingTitle')}
            description={t('pendingDescription')}
          />
          <ul className="mt-6 divide-y divide-dash-border overflow-hidden rounded-2xl border border-dash-border">
            {pendingInvites.map((invite) => {
              const roleKey = roleLabelKey(invite.role)
              return (
                <li
                  key={invite.id}
                  className="flex flex-col gap-3 bg-canvas px-4 py-3.5 sm:flex-row sm:items-center sm:gap-3 sm:px-5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-dash-surface text-positive-deep">
                      <Mail className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{invite.email}</p>
                      <p className="truncate text-sm text-body">
                        {t('pendingInvitedBy', { name: invite.inviterName })}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                    <span className="rounded-md bg-warning/15 px-2.5 py-1 text-xs font-semibold tracking-wide text-ink uppercase">
                      {roleKey === 'other' ? invite.role : t(`roles.${roleKey}`)}
                    </span>
                    {canInviteMembers ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 border-dash-border text-body hover:bg-dash-surface hover:text-ink"
                        aria-label={t('cancelInviteAria', { email: invite.email })}
                        disabled={cancelPending}
                        onClick={() => {
                          setCancelError(null)
                          setCancelTarget(invite)
                        }}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </DashboardPanel>
      ) : null}

      {canInviteMembers ? (
        <InviteMemberSheet
          open={inviteOpen}
          onOpenChange={handleInviteOpenChange}
          onInvited={() => {
            void loadTeam()
          }}
        />
      ) : null}

      {removeTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!removePending) setRemoveTarget(null)
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={removeTitleId}
            aria-describedby={removeDescId}
            className="w-full max-w-md rounded-2xl border border-dash-border bg-canvas p-5 shadow-[0_20px_50px_rgb(15_23_42/0.18)] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={removeTitleId} className="font-display text-lg tracking-tight text-ink">
              {t('removeConfirmTitle')}
            </h2>
            <p id={removeDescId} className="mt-2 text-sm leading-6 text-body">
              {t('removeConfirmBody', {
                name: removeTarget.name.trim() || removeTarget.email,
              })}
            </p>

            {removeError ? (
              <p role="alert" className="mt-3 text-sm text-negative">
                {removeError}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={removePending}
                onClick={() => setRemoveTarget(null)}
              >
                {t('removeCancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={removePending}
                className="gap-2"
                onClick={() => {
                  void handleRemoveConfirm()
                }}
              >
                {removePending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('removing')}
                  </>
                ) : (
                  t('removeConfirm')
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (!cancelPending) setCancelTarget(null)
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={cancelTitleId}
            aria-describedby={cancelDescId}
            className="w-full max-w-md rounded-2xl border border-dash-border bg-canvas p-5 shadow-[0_20px_50px_rgb(15_23_42/0.18)] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={cancelTitleId} className="font-display text-lg tracking-tight text-ink">
              {t('cancelInviteConfirmTitle')}
            </h2>
            <p id={cancelDescId} className="mt-2 text-sm leading-6 text-body">
              {t('cancelInviteConfirmBody', { email: cancelTarget.email })}
            </p>

            {cancelError ? (
              <p role="alert" className="mt-3 text-sm text-negative">
                {cancelError}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={cancelPending}
                onClick={() => setCancelTarget(null)}
              >
                {t('cancelInviteDismiss')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={cancelPending}
                className="gap-2"
                onClick={() => {
                  void handleCancelInviteConfirm()
                }}
              >
                {cancelPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('cancelingInvite')}
                  </>
                ) : (
                  t('cancelInviteConfirm')
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
