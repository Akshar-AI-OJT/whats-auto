'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  Pencil,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/i18n/navigation'
import {
  api,
  type ApiError,
  type OrganizationAdminUser,
  type OrganizationMember,
  type PaginationMeta,
  type PendingInvitation,
} from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { ASSIGNABLE_ROLES, type AssignableRole } from '@/lib/onboarding'
import { cn } from '@/lib/utils'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { InviteMemberSheet } from '@/components/dashboard/team/InviteMemberSheet'
import { EditOrgAdminUserDialog } from '@/components/dashboard/team/EditOrgAdminUserDialog'
import { WorkspaceAvatar } from '@/components/dashboard/WorkspaceSwitcher'

const DEFAULT_PER_PAGE = 20

/** Normalized row for the Team list UI. */
type TeamMemberRow = {
  /** Membership id — used for role assign / remove. */
  memberId: string
  userId: string
  name: string
  email: string
  role: string
  isActive?: boolean
}

function unwrapList<T>(data: { data?: T[] } | T[] | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.data)) return data.data
  return []
}

function unwrapPaginatedUsers(payload: unknown): {
  users: OrganizationAdminUser[]
  meta: PaginationMeta | null
} {
  if (!payload || typeof payload !== 'object') {
    return { users: [], meta: null }
  }

  const root = payload as {
    data?: unknown
    meta?: PaginationMeta
  }

  // serialize(paginate) → { data: [...], meta }
  if (Array.isArray(root.data) && root.meta) {
    return { users: root.data as OrganizationAdminUser[], meta: root.meta }
  }

  // Nested wrap edge case: { data: { data: [...], meta } }
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) {
    const nested = root.data as { data?: OrganizationAdminUser[]; meta?: PaginationMeta }
    if (Array.isArray(nested.data)) {
      return { users: nested.data, meta: nested.meta ?? root.meta ?? null }
    }
  }

  if (Array.isArray(root.data)) {
    return { users: root.data as OrganizationAdminUser[], meta: root.meta ?? null }
  }

  return { users: [], meta: null }
}

function fromAdminUser(user: OrganizationAdminUser): TeamMemberRow {
  return {
    memberId: user.memberId,
    userId: user.id,
    name: user.name?.trim() || `${user.firstname ?? ''} ${user.lastname ?? ''}`.trim(),
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  }
}

function fromMember(member: OrganizationMember): TeamMemberRow {
  return {
    memberId: member.id,
    userId: member.userId,
    name: member.name,
    email: member.email,
    role: member.role,
  }
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

const filterSelectClassName = cn(
  'h-10 shrink-0 rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
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
    tenantOrganizationId,
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
  const queryClient = useQueryClient()

  const [actionError, setActionError] = useState<string | null>(null)
  const [rolePendingId, setRolePendingId] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<TeamMemberRow | null>(null)
  const [removePending, setRemovePending] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<PendingInvitation | null>(null)
  const [cancelPending, setCancelPending] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [editUserId, setEditUserId] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const perPage = DEFAULT_PER_PAGE
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | AssignableRole | 'owner'>('all')

  // Reset filter/pagination when workspace changes.
  const [listWorkspaceId, setListWorkspaceId] = useState(tenantOrganizationId)
  if (tenantOrganizationId !== listWorkspaceId) {
    setListWorkspaceId(tenantOrganizationId)
    setPage(1)
    setSearchQuery('')
    setRoleFilter('all')
  }

  const teamEnabled = !orgsLoading && Boolean(tenantOrganizationId) && canViewTeam

  const membersQuery = useQuery({
    queryKey: queryKeys.team.list(tenantOrganizationId, { page, perPage }),
    queryFn: async () => {
      try {
        const usersResult = await api.organizationAdmin.listUsers({ page, perPage })
        const { users, meta: nextMeta } = unwrapPaginatedUsers(usersResult.data)
        return {
          members: users.map(fromAdminUser),
          meta:
            nextMeta ??
            ({
              total: users.length,
              perPage,
              currentPage: page,
              lastPage: 1,
            } satisfies PaginationMeta),
          paginatedSource: true as const,
        }
      } catch (err) {
        const apiError = err as ApiError
        if (
          apiError.status !== 403 &&
          apiError.code !== 'NOT_ORGANIZATION_ADMIN' &&
          apiError.code !== 'PERMISSION_DENIED'
        ) {
          throw err
        }
        const membersResult = await api.members.list()
        return {
          members: unwrapList(membersResult.data).map(fromMember),
          meta: null,
          paginatedSource: false as const,
        }
      }
    },
    enabled: teamEnabled,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  })

  const invitesQuery = useQuery({
    queryKey: queryKeys.team.invites(tenantOrganizationId),
    queryFn: async () => {
      try {
        const invitesResult = await api.invitations.list()
        return unwrapList<PendingInvitation>(invitesResult.data)
      } catch {
        return [] as PendingInvitation[]
      }
    },
    enabled: teamEnabled,
    staleTime: 60_000,
  })

  const members = useMemo(() => membersQuery.data?.members ?? [], [membersQuery.data])
  const pendingInvites = invitesQuery.data ?? []
  const meta = membersQuery.data?.meta ?? null
  const paginatedSource = membersQuery.data?.paginatedSource ?? false
  const listLoading = membersQuery.isLoading || invitesQuery.isLoading || orgsLoading
  const listError = membersQuery.error
    ? (membersQuery.error as unknown as ApiError).message || t('errors.loadFailed')
    : null

  async function invalidateTeam() {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.team.all(tenantOrganizationId),
    })
  }

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
    if (
      apiError.status === 403 ||
      apiError.code === 'PERMISSION_DENIED' ||
      apiError.code === 'NOT_ORGANIZATION_ADMIN'
    ) {
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

  async function handleRoleChange(member: TeamMemberRow, nextRole: string) {
    if (!canAssignRole || !isAssignableRole(nextRole) || nextRole === member.role) return

    setActionError(null)
    setRolePendingId(member.memberId)
    queryClient.setQueryData(
      queryKeys.team.list(tenantOrganizationId, { page, perPage }),
      (old: typeof membersQuery.data) => {
        if (!old) return old
        return {
          ...old,
          members: old.members.map((row) =>
            row.memberId === member.memberId ? { ...row, role: nextRole } : row
          ),
        }
      }
    )
    try {
      await api.members.assignRole(member.memberId, nextRole)
    } catch (err) {
      queryClient.setQueryData(
        queryKeys.team.list(tenantOrganizationId, { page, perPage }),
        (old: typeof membersQuery.data) => {
          if (!old) return old
          return {
            ...old,
            members: old.members.map((row) =>
              row.memberId === member.memberId ? { ...row, role: member.role } : row
            ),
          }
        }
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
      // Prefer org-admin soft-delete (by userId) when the list came from that API;
      // otherwise fall back to membership remove (team:remove).
      if (paginatedSource) {
        await api.organizationAdmin.softDeleteUser(removeTarget.userId)
      } else {
        await api.members.remove(removeTarget.memberId)
      }
      setRemoveTarget(null)
      setActionError(null)
      await invalidateTeam()
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
      setCancelTarget(null)
      setActionError(null)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.team.invites(tenantOrganizationId),
      })
    } catch (err) {
      setCancelError(mapMemberActionError(err))
    } finally {
      setCancelPending(false)
    }
  }

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return members.filter((member) => {
      if (roleFilter !== 'all' && member.role.toLowerCase() !== roleFilter) {
        return false
      }
      if (!q) return true
      return (
        member.name.toLowerCase().includes(q) ||
        member.email.toLowerCase().includes(q) ||
        member.role.toLowerCase().includes(q)
      )
    })
  }, [members, searchQuery, roleFilter])

  const showEmpty = !listLoading && !listError && members.length === 0
  const showNoMatches =
    !listLoading && !listError && members.length > 0 && filteredMembers.length === 0
  const currentMemberId = accessContext?.memberId ?? null
  const lastPage = meta?.lastPage ?? 1
  const currentPage = meta?.currentPage ?? page
  const total = meta?.total ?? members.length
  const canGoPrev = paginatedSource && currentPage > 1
  const canGoNext = paginatedSource && currentPage < lastPage

  if (!orgsLoading && !canViewTeam) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
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
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
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
            <Button type="button" className="shrink-0 gap-2" onClick={() => setInviteForced(true)}>
              <UserPlus className="size-4" aria-hidden />
              {t('inviteCta')}
            </Button>
          ) : null}
        </div>
      </DashboardPanel>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader title={t('membersTitle')} description={t('membersDescription')} />

        {!listLoading && !listError ? (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
                aria-hidden
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="h-10 rounded-xl border-dash-border bg-canvas pl-9"
                aria-label={t('searchPlaceholder')}
              />
            </div>
            <select
              className={filterSelectClassName}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'all' | AssignableRole | 'owner')}
              aria-label={t('roleFilterAria')}
            >
              <option value="all">{t('roleFilterAll')}</option>
              <option value="owner">{t('roles.owner')}</option>
              {ASSIGNABLE_ROLES.map((value) => (
                <option key={value} value={value}>
                  {t(`roles.${value}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {paginatedSource && searchQuery.trim() ? (
          <p className="mt-2 text-xs text-mute">{t('searchPageHint')}</p>
        ) : null}

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
        ) : showNoMatches ? (
          <div className="mt-8 rounded-2xl border border-dashed border-dash-border bg-dash-surface/50 px-6 py-12 text-center text-sm text-body">
            {t('noMatches')}
          </div>
        ) : (
          <>
            <ul className="mt-6 divide-y divide-dash-border overflow-hidden rounded-2xl border border-dash-border">
              {filteredMembers.map((member) => {
                const roleKey = roleLabelKey(member.role)
                const isOwner = member.role.toLowerCase() === 'owner'
                const isSelf = Boolean(currentMemberId && member.memberId === currentMemberId)
                const canEditRole =
                  canAssignRole && !isOwner && !isSelf && isAssignableRole(member.role)
                const canRemove = canRemoveMember && !isOwner && !isSelf
                // Profile edit/deactivate uses organization-admin APIs (Owner/Admin list path).
                const canEditProfile = paginatedSource
                const roleBusy = rolePendingId === member.memberId

                return (
                  <li
                    key={member.memberId}
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
                          {member.isActive === false ? (
                            <span className="ml-1.5 text-xs font-normal text-warning">
                              ({t('inactive')})
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

                      {canEditProfile ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-9"
                          aria-label={t('editAria', {
                            name: member.name.trim() || member.email,
                          })}
                          onClick={() => setEditUserId(member.userId)}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                      ) : null}

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

            {paginatedSource && meta ? (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-body">
                  {t('paginationSummary', {
                    page: currentPage,
                    lastPage,
                    total,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={!canGoPrev || listLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                    {t('prevPage')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={!canGoNext || listLoading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t('nextPage')}
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </DashboardPanel>

      {!listLoading && !listError && pendingInvites.length > 0 ? (
        <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
          <DashboardSectionHeader title={t('pendingTitle')} description={t('pendingDescription')} />
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
            void invalidateTeam()
          }}
        />
      ) : null}

      <EditOrgAdminUserDialog
        open={Boolean(editUserId)}
        userId={editUserId}
        onOpenChange={(next) => {
          if (!next) setEditUserId(null)
        }}
        onUpdated={() => {
          void invalidateTeam()
        }}
      />

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
