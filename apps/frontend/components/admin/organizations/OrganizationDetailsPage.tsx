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
import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { KPIStatCard } from '@/components/dashboard/overview/KPIStatCard'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import {
  findSuperAdminOrganization,
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

function OrganizationHeader({ org }: { org: AdminOrganizationListItem }) {
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
            <OrganizationPlanBadge label={t('filters.plan.unavailable')} />
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

function GeneralInformation({ org }: { org: AdminOrganizationListItem }) {
  const t = useTranslations('admin.organizations.detail.general')

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />
      <dl className="mt-2">
        <InfoRow label={t('fields.name')} value={org.name} />
        <InfoRow label={t('fields.slug')} value={org.slug} />
        <InfoRow label={t('fields.owner')} value="—" />
        <InfoRow label={t('fields.ownerEmail')} value={org.email} />
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

function SubscriptionSection() {
  const t = useTranslations('admin.organizations.detail.subscription')

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />
      <p className="mt-6 text-sm text-mute">{t('unavailable')}</p>
    </DashboardPanel>
  )
}

function WorkspaceStatistics() {
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

function TeamMembersSection() {
  const t = useTranslations('admin.organizations.detail.members')

  return (
    <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description', { count: 0 })} />
      <p className="mt-6 text-sm text-mute">{t('unavailable')}</p>
    </DashboardPanel>
  )
}

function RecentActivitySection() {
  const t = useTranslations('admin.organizations.detail.activity')

  return (
    <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />
      <p className="mt-6 text-sm text-mute">{t('unavailable')}</p>
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
  const [org, setOrg] = useState<AdminOrganizationListItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void findSuperAdminOrganization(orgId)
      .then((found) => {
        if (cancelled) return
        setOrg(found)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setOrg(null)
        setError(mapOrgApiError(err, t('errors.loadFailed')))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId, t])

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
        <DashboardPanel className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-body">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('loading')}
        </DashboardPanel>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
        <DashboardPanel className="px-5 py-10 text-center sm:px-8">
          <p role="alert" className="text-sm text-negative">
            {error}
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
      <OrganizationHeader org={org} />

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-12 xl:gap-6">
        <div className="min-w-0 xl:col-span-7">
          <GeneralInformation org={org} />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <SubscriptionSection />
        </div>
      </div>

      <WorkspaceStatistics />
      <TeamMembersSection />
      <RecentActivitySection />
    </div>
  )
}
