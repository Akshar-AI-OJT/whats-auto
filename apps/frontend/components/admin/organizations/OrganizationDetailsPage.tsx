'use client'

import {
  ArrowLeft,
  FileText,
  Loader2,
  Megaphone,
  MessageCircle,
  Phone,
  Send,
  Users,
} from 'lucide-react'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import {
  api,
  type ApiError,
  type AuthorizationAuditEvent,
  type SuperAdminPlan,
  type SuperAdminPlatformUser,
  type SuperAdminSubscription,
} from '@/lib/api'
import { KPIStatCard } from '@/components/dashboard/overview/KPIStatCard'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { listSuperAdminPlatformUsers } from '@/components/admin/platform-users/platform-users-api'
import {
  findPlanById,
  listSuperAdminPlansCatalog,
  listSuperAdminSubscriptions,
  planAmountLabel,
  planBillingKind,
  planLabel,
} from '@/components/admin/subscriptions/subscription-api'
import {
  getSuperAdminOrganization,
  mapOrgApiError,
  type AdminOrganizationListItem,
} from './organization-api'
import {
  OrganizationPlanBadge,
  OrganizationStatusBadge,
} from './OrganizationActionsMenu'

function formatDate(value: string) {
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(value: string | Date | null | undefined, empty: string) {
  if (!value) return empty
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function isOrgNotFound(error: unknown): boolean {
  const apiError = error as ApiError
  return apiError?.status === 404 || apiError?.code === 'E_ORGANIZATION_NOT_FOUND'
}

function unwrapAuditEvents(data: unknown): AuthorizationAuditEvent[] {
  if (!data) return []
  if (Array.isArray(data)) return data as AuthorizationAuditEvent[]
  if (typeof data === 'object' && data !== null && 'data' in data) {
    const wrapped = data as { data?: AuthorizationAuditEvent[] }
    if (Array.isArray(wrapped.data)) return wrapped.data
  }
  return []
}

function pickSubscription(
  subscriptions: SuperAdminSubscription[],
  organizationId: string
): SuperAdminSubscription | null {
  const matches = subscriptions.filter((row) => row.organizationId === organizationId)
  if (matches.length === 0) return null
  const rank = (status: string) => (status === 'active' ? 0 : status === 'trialing' ? 1 : 2)
  return [...matches].sort((a, b) => rank(String(a.status)) - rank(String(b.status)))[0] ?? null
}

function membershipRole(user: SuperAdminPlatformUser, organizationId: string): string {
  return user.organizations.find((org) => org.organizationId === organizationId)?.role ?? ''
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-dash-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="text-sm text-mute">{label}</dt>
      <dd className="min-w-0 text-sm font-medium break-all text-ink sm:text-right">
        {value}
      </dd>
    </div>
  )
}

function OrganizationHeader({
  org,
  planBadgeLabel,
}: {
  org: AdminOrganizationListItem
  planBadgeLabel: string
}) {
  const t = useTranslations('admin.organizations')
  const td = useTranslations('admin.organizations.detail')

  return (
    <DashboardPanel
      as="section"
      className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-primary-pale/80 blur-[70px]"
      />
      <div className="relative">
        <Link
          href="/admin/organizations"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-mute',
            'transition-colors duration-150 hover:text-ink',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
          )}
        >
          <ArrowLeft className="size-4" aria-hidden />
          {td('back')}
        </Link>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-on-primary shadow-[0_6px_16px_rgb(37_99_235/0.35)]">
              {getInitials(org.name)}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
                {td('eyebrow')}
              </p>
              <h1 className="mt-1 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
                {org.name}
              </h1>
              <p className="mt-1 text-sm text-mute">{org.slug}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <OrganizationPlanBadge label={planBadgeLabel} />
            <OrganizationStatusBadge
              status={org.uiStatus}
              label={t(`filters.status.${org.uiStatus}`)}
            />
          </div>
        </div>
      </div>
    </DashboardPanel>
  )
}

function GeneralInformation({
  org,
  ownerName,
  ownerEmail,
}: {
  org: AdminOrganizationListItem
  ownerName: string
  ownerEmail: string
}) {
  const t = useTranslations('admin.organizations.detail.general')

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />
      <dl className="mt-2">
        <InfoRow label={t('fields.name')} value={org.name} />
        <InfoRow label={t('fields.slug')} value={org.slug} />
        <InfoRow label={t('fields.owner')} value={ownerName} />
        <InfoRow label={t('fields.ownerEmail')} value={ownerEmail} />
        <InfoRow label={t('fields.industry')} value={org.industry || '—'} />
        <InfoRow
          label={t('fields.website')}
          value={
            org.website ? (
              <a
                href={org.website}
                className="text-positive-deep underline-offset-2 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {org.website.replace(/^https?:\/\//, '')}
              </a>
            ) : (
              '—'
            )
          }
        />
        <InfoRow label={t('fields.country')} value={org.country || '—'} />
        <InfoRow label={t('fields.timezone')} value={org.timezone || '—'} />
        <InfoRow label={t('fields.phone')} value={org.phone || '—'} />
        <InfoRow label={t('fields.created')} value={formatDate(org.createdAt)} />
      </dl>
    </DashboardPanel>
  )
}

function billingCycleLabel(
  planId: string,
  plans: SuperAdminPlan[],
  labels: { monthly: string; annual: string; custom: string }
): string {
  const plan = findPlanById(plans, planId)
  if (!plan) return '—'
  if (plan.billingPeriod === 'monthly') return labels.monthly
  if (plan.billingPeriod === 'yearly') return labels.annual
  if (plan.billingPeriod === 'custom' || planBillingKind(planId, plans) === 'custom') {
    return labels.custom
  }
  return '—'
}

function SubscriptionSection({
  subscription,
  plans,
  isLoading,
  isError,
}: {
  subscription: SuperAdminSubscription | null
  plans: SuperAdminPlan[]
  isLoading: boolean
  isError: boolean
}) {
  const t = useTranslations('admin.organizations.detail.subscription')
  const plan = subscription ? findPlanById(plans, subscription.planId) : undefined
  const seats =
    typeof plan?.limits.users === 'number' ? String(plan.limits.users) : '—'

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />
      {isLoading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-mute">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('loading')}
        </div>
      ) : isError ? (
        <p role="alert" className="mt-6 text-sm text-negative">
          {t('failed')}
        </p>
      ) : !subscription ? (
        <p className="mt-6 text-sm text-mute">{t('empty')}</p>
      ) : (
        <dl className="mt-2">
          <InfoRow label={t('fields.plan')} value={planLabel(subscription.planId, plans)} />
          <InfoRow
            label={t('fields.billingCycle')}
            value={billingCycleLabel(subscription.planId, plans, {
              monthly: t('billingCycle.monthly'),
              annual: t('billingCycle.annual'),
              custom: t('billingCycle.custom'),
            })}
          />
          <InfoRow
            label={t('fields.amount')}
            value={planAmountLabel(subscription.planId, plans, '—')}
          />
          <InfoRow label={t('fields.seats')} value={seats} />
          <InfoRow
            label={t('fields.renewsOn')}
            value={formatDate(subscription.currentPeriodEnd)}
          />
          <InfoRow label={t('fields.paymentMethod')} value="—" />
          <InfoRow label={t('fields.invoiceEmail')} value="—" />
        </dl>
      )}
    </DashboardPanel>
  )
}

function OrganizationStatistics() {
  const t = useTranslations('admin.organizations.detail.stats')

  const items = useMemo(
    () =>
      [
        { key: 'contacts' as const, icon: Users },
        { key: 'conversations' as const, icon: MessageCircle },
        { key: 'campaignsSent' as const, icon: Megaphone },
        { key: 'messagesSent' as const, icon: Send },
        { key: 'whatsappNumbers' as const, icon: Phone },
        { key: 'templates' as const, icon: FileText },
      ],
    []
  )

  return (
    <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <KPIStatCard
            key={item.key}
            label={t(`cards.${item.key}.label`)}
            hint={t(`cards.${item.key}.hint`)}
            value="—"
            format="plain"
            icon={item.icon}
          />
        ))}
      </div>
    </DashboardPanel>
  )
}

function memberRoleLabel(role: string, labels: { owner: string; admin: string; member: string }): string {
  if (role === 'owner') return labels.owner
  if (role === 'admin') return labels.admin
  if (role === 'member') return labels.member
  return role || '—'
}

function TeamMembersSection({
  organizationId,
  members,
  isLoading,
  isError,
}: {
  organizationId: string
  members: SuperAdminPlatformUser[]
  isLoading: boolean
  isError: boolean
}) {
  const t = useTranslations('admin.organizations.detail.members')

  return (
    <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader
        title={t('title')}
        description={t('description', { count: isLoading || isError ? 0 : members.length })}
      />
      {isLoading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-mute">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('loading')}
        </div>
      ) : isError ? (
        <p role="alert" className="mt-6 text-sm text-negative">
          {t('failed')}
        </p>
      ) : members.length === 0 ? (
        <p className="mt-6 text-sm text-mute">{t('empty')}</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-dash-border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left">
              <thead>
                <tr className="border-b border-dash-border bg-dash-surface">
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                    {t('columns.member')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                    {t('columns.role')}
                  </th>
                  <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                    {t('columns.lastActive')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member, index) => (
                  <tr
                    key={member.id}
                    className={cn(
                      'border-b border-dash-border last:border-b-0',
                      index % 2 === 1 && 'bg-dash-surface/60'
                    )}
                  >
                    <td className="px-4 py-3.5">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {member.name || '—'}
                      </span>
                      <span className="block truncate text-xs text-mute">
                        {member.email || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-ink">
                      {memberRoleLabel(membershipRole(member, organizationId), {
                        owner: t('roles.owner'),
                        admin: t('roles.admin'),
                        member: t('roles.member'),
                      })}
                    </td>
                    <td className="px-4 py-3.5 text-sm tabular-nums text-mute">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardPanel>
  )
}

function RecentActivitySection({
  events,
  isLoading,
  isError,
}: {
  events: AuthorizationAuditEvent[]
  isLoading: boolean
  isError: boolean
}) {
  const t = useTranslations('admin.organizations.detail.activity')

  return (
    <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />
      {isLoading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-mute">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('loading')}
        </div>
      ) : isError ? (
        <p role="alert" className="mt-6 text-sm text-negative">
          {t('failed')}
        </p>
      ) : events.length === 0 ? (
        <p className="mt-6 text-sm text-mute">{t('empty')}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="rounded-xl border border-dash-border bg-dash-surface/40 px-4 py-3"
            >
              <p className="text-sm font-medium text-ink">{event.eventType}</p>
              <p className="mt-1 text-xs text-mute">{formatDateTime(event.createdAt, '—')}</p>
              {event.reason ? <p className="mt-1 text-xs text-body">{event.reason}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  )
}

function OrganizationNotFound() {
  const t = useTranslations('admin.organizations.detail')

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
      <DashboardPanel className="px-5 py-10 text-center sm:px-8">
        <h1 className="font-display text-2xl font-semibold text-ink">{t('notFoundTitle')}</h1>
        <p className="mt-2 text-sm text-body">{t('notFoundDescription')}</p>
        <Link
          href="/admin/organizations"
          className={cn(
            'mt-6 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary',
            'transition-opacity hover:opacity-90'
          )}
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('back')}
        </Link>
      </DashboardPanel>
    </div>
  )
}

export function OrganizationDetailsPage({ orgId }: { orgId: string }) {
  const t = useTranslations('admin.organizations')

  const orgQuery = useQuery({
    queryKey: queryKeys.admin.organizationDetail(orgId),
    queryFn: () => getSuperAdminOrganization(orgId),
    retry: (failureCount, error) => !isOrgNotFound(error) && failureCount < 1,
  })

  const plansQuery = useQuery({
    queryKey: queryKeys.admin.plans({ status: 'all', scope: 'organization-detail' }),
    queryFn: () => listSuperAdminPlansCatalog('all'),
    enabled: orgQuery.isSuccess,
  })

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.admin.organizationSubscription(orgId),
    queryFn: async () => {
      const { items } = await listSuperAdminSubscriptions({
        search: orgId,
        page: 1,
        perPage: 100,
      })
      return pickSubscription(items, orgId)
    },
    enabled: orgQuery.isSuccess,
  })

  const membersQuery = useQuery({
    queryKey: queryKeys.admin.organizationMembers(orgId),
    queryFn: async () => {
      const { items } = await listSuperAdminPlatformUsers({
        organizationId: orgId,
        page: 1,
        perPage: 100,
      })
      return items
    },
    enabled: orgQuery.isSuccess,
  })

  const activityQuery = useQuery({
    queryKey: queryKeys.admin.organizationActivity(orgId),
    queryFn: async () => {
      const { data } = await api.superAdmin.auditLogs.list({ limit: 50, organizationId: orgId })
      return unwrapAuditEvents(data)
    },
    enabled: orgQuery.isSuccess,
  })

  const org = orgQuery.data ?? null
  const members = membersQuery.data ?? []
  const plans = plansQuery.data ?? []
  const subscription = subscriptionQuery.data ?? null
  const owner = members.find((user) => membershipRole(user, orgId) === 'owner')
  const planBadgeLabel = subscription
    ? planLabel(subscription.planId, plans)
    : t('filters.plan.unavailable')

  if (orgQuery.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
        <DashboardPanel className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-body">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('loading')}
        </DashboardPanel>
      </div>
    )
  }

  if (orgQuery.isError && isOrgNotFound(orgQuery.error)) {
    return <OrganizationNotFound />
  }

  if (orgQuery.isError) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
        <DashboardPanel className="px-5 py-10 text-center sm:px-8">
          <p role="alert" className="text-sm text-negative">
            {mapOrgApiError(orgQuery.error, t('errors.loadFailed'))}
          </p>
          <Link
            href="/admin/organizations"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-positive-deep hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t('detail.back')}
          </Link>
        </DashboardPanel>
      </div>
    )
  }

  if (!org) {
    return <OrganizationNotFound />
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6 xl:gap-7">
      <OrganizationHeader org={org} planBadgeLabel={planBadgeLabel} />

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-12 xl:gap-6">
        <div className="min-w-0 xl:col-span-7">
          <GeneralInformation
            org={org}
            ownerName={owner?.name || '—'}
            ownerEmail={owner?.email || '—'}
          />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <SubscriptionSection
            subscription={subscription}
            plans={plans}
            isLoading={subscriptionQuery.isLoading || plansQuery.isLoading}
            isError={subscriptionQuery.isError || plansQuery.isError}
          />
        </div>
      </div>

      <OrganizationStatistics />
      <TeamMembersSection
        organizationId={orgId}
        members={members}
        isLoading={membersQuery.isLoading}
        isError={membersQuery.isError}
      />
      <RecentActivitySection
        events={activityQuery.data ?? []}
        isLoading={activityQuery.isLoading}
        isError={activityQuery.isError}
      />
    </div>
  )
}
