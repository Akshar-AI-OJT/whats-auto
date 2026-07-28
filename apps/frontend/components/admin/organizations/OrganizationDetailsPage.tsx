'use client'

import {
  ArrowLeft,
  Building2,
  CreditCard,
  FileText,
  Megaphone,
  MessageCircle,
  Phone,
  Send,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { ActivityItem } from '@/components/dashboard/overview/ActivityItem'
import { KPIStatCard } from '@/components/dashboard/overview/KPIStatCard'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import {
  getMockOrganizationDetail,
  type AdminActivityKind,
  type MockOrganizationDetail,
  type OrganizationMemberRole,
} from '../mock-data'
import {
  OrganizationPlanBadge,
  OrganizationStatusBadge,
} from './OrganizationActionsMenu'

const ACTIVITY_ICONS: Record<AdminActivityKind, LucideIcon> = {
  organization: Building2,
  subscription: CreditCard,
  user: Users,
  support: MessageCircle,
  billing: CreditCard,
}

const ROLE_STYLES: Record<OrganizationMemberRole, string> = {
  owner: 'bg-primary-pale text-positive-deep ring-1 ring-primary/30',
  admin: 'bg-dash-info-soft text-dash-info ring-1 ring-accent-cyan/35',
  member: 'bg-dash-surface text-mute ring-1 ring-dash-border',
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
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

function OrganizationHeader({ org }: { org: MockOrganizationDetail }) {
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
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-on-primary shadow-[0_6px_16px_rgb(159_232_112/0.35)]">
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
            <OrganizationPlanBadge label={t(`filters.plan.${org.plan}`)} />
            <OrganizationStatusBadge
              status={org.status}
              label={t(`filters.status.${org.status}`)}
            />
          </div>
        </div>
      </div>
    </DashboardPanel>
  )
}

function GeneralInformation({ org }: { org: MockOrganizationDetail }) {
  const t = useTranslations('admin.organizations.detail.general')

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />
      <dl className="mt-2">
        <InfoRow label={t('fields.name')} value={org.name} />
        <InfoRow label={t('fields.slug')} value={org.slug} />
        <InfoRow label={t('fields.owner')} value={org.ownerName} />
        <InfoRow label={t('fields.ownerEmail')} value={org.ownerEmail} />
        <InfoRow label={t('fields.industry')} value={org.industry} />
        <InfoRow
          label={t('fields.website')}
          value={
            <a
              href={org.website}
              className="text-positive-deep underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {org.website.replace(/^https?:\/\//, '')}
            </a>
          }
        />
        <InfoRow label={t('fields.country')} value={org.country} />
        <InfoRow label={t('fields.timezone')} value={org.timezone} />
        <InfoRow label={t('fields.phone')} value={org.phone} />
        <InfoRow label={t('fields.created')} value={formatDate(org.createdAt)} />
      </dl>
    </DashboardPanel>
  )
}

function SubscriptionSection({ org }: { org: MockOrganizationDetail }) {
  const t = useTranslations('admin.organizations.detail.subscription')
  const tp = useTranslations('admin.organizations.filters.plan')
  const { subscription } = org

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />
      <dl className="mt-2">
        <InfoRow label={t('fields.plan')} value={tp(subscription.plan)} />
        <InfoRow
          label={t('fields.billingCycle')}
          value={t(`billingCycle.${subscription.billingCycle}`)}
        />
        <InfoRow
          label={t('fields.amount')}
          value={`${formatMoney(subscription.amount)} / ${t(`billingCycle.short.${subscription.billingCycle}`)}`}
        />
        <InfoRow label={t('fields.seats')} value={subscription.seats} />
        <InfoRow label={t('fields.renewsOn')} value={formatDate(subscription.renewsOn)} />
        <InfoRow label={t('fields.paymentMethod')} value={subscription.paymentMethod} />
        <InfoRow label={t('fields.invoiceEmail')} value={subscription.invoiceEmail} />
      </dl>
    </DashboardPanel>
  )
}

function WorkspaceStatistics({ org }: { org: MockOrganizationDetail }) {
  const t = useTranslations('admin.organizations.detail.stats')
  const { stats } = org

  const items = useMemo(
    () =>
      [
        {
          key: 'contacts',
          icon: Users,
          value: stats.contacts,
        },
        {
          key: 'conversations',
          icon: MessageCircle,
          value: stats.conversations,
        },
        {
          key: 'campaignsSent',
          icon: Megaphone,
          value: stats.campaignsSent,
        },
        {
          key: 'messagesSent',
          icon: Send,
          value: stats.messagesSent,
        },
        {
          key: 'whatsappNumbers',
          icon: Phone,
          value: stats.whatsappNumbers,
        },
        {
          key: 'templates',
          icon: FileText,
          value: stats.templates,
        },
      ] as const,
    [stats]
  )

  return (
    <section className="flex flex-col gap-4">
      <DashboardSectionHeader title={t('title')} description={t('description')} />
      <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <KPIStatCard
            key={item.key}
            label={t(`cards.${item.key}.label`)}
            value={item.value}
            hint={t(`cards.${item.key}.hint`)}
            icon={item.icon}
            animate={false}
            className="h-full"
          />
        ))}
      </div>
    </section>
  )
}

function WorkspaceMembers({ org }: { org: MockOrganizationDetail }) {
  const t = useTranslations('admin.organizations.detail.members')
  const members = useMemo(
    () =>
      org.memberList.map((member) => ({
        ...member,
        initials: getInitials(member.name),
        lastActiveLabel: formatDate(member.lastActiveOn),
      })),
    [org.memberList]
  )

  return (
    <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader
        title={t('title')}
        description={t('description', { count: org.memberList.length })}
      />

      <div className="mt-5 hidden overflow-hidden rounded-2xl border border-dash-border md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-dash-border bg-dash-surface">
                <th className="px-4 py-3.5 text-sm font-semibold text-ink sm:px-5">
                  {t('columns.member')}
                </th>
                <th className="px-4 py-3.5 text-sm font-semibold text-ink">
                  {t('columns.role')}
                </th>
                <th className="px-4 py-3.5 text-sm font-semibold text-ink sm:px-5">
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
                  <td className="px-4 py-3.5 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-on-primary">
                        {member.initials}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {member.name}
                        </span>
                        <span className="block truncate text-xs text-mute">
                          {member.email}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={cn(
                        'inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold',
                        ROLE_STYLES[member.role]
                      )}
                    >
                      {t(`roles.${member.role}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-sm tabular-nums text-body sm:px-5">
                    {member.lastActiveLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="mt-5 flex flex-col gap-3 md:hidden">
        {members.map((member) => (
          <li
            key={member.id}
            className="rounded-2xl border border-dash-border bg-dash-surface/60 p-4"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-on-primary">
                {member.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{member.name}</p>
                <p className="truncate text-xs text-mute">{member.email}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold',
                      ROLE_STYLES[member.role]
                    )}
                  >
                    {t(`roles.${member.role}`)}
                  </span>
                  <span className="text-xs text-mute">
                    {t('columns.lastActive')}: {member.lastActiveLabel}
                  </span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </DashboardPanel>
  )
}

function OrganizationActivity({ org }: { org: MockOrganizationDetail }) {
  const t = useTranslations('admin.organizations.detail.activity')

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />
      <ol className="mt-6 flex flex-1 flex-col">
        {org.activity.map((item, index) => (
          <li key={item.id}>
            <ActivityItem
              id={item.id}
              title={item.title}
              detail={item.detail}
              timestamp={item.timestamp}
              tone={item.tone}
              icon={ACTIVITY_ICONS[item.kind]}
              isLast={index === org.activity.length - 1}
            />
          </li>
        ))}
      </ol>
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
  const org = useMemo(() => getMockOrganizationDetail(orgId), [orgId])

  if (!org) {
    return <OrganizationNotFound />
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6 xl:gap-7">
      <OrganizationHeader org={org} />

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-12 xl:gap-6">
        <div className="min-w-0 xl:col-span-7">
          <GeneralInformation org={org} />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <SubscriptionSection org={org} />
        </div>
      </div>

      <WorkspaceStatistics org={org} />

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-12 xl:gap-6">
        <div className="min-w-0 xl:col-span-7">
          <WorkspaceMembers org={org} />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <OrganizationActivity org={org} />
        </div>
      </div>
    </div>
  )
}
