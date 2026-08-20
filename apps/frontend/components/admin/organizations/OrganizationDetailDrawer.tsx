'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Building2, CreditCard, ExternalLink, Loader2, ScrollText, Users } from 'lucide-react'
import { api, type AuthorizationAuditEvent, type SuperAdminSubscription } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Link } from '@/i18n/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  planAmountLabel,
  planBillingKind,
  planLabel as resolvePlanLabel,
} from '@/components/admin/subscriptions/subscription-api'
import type { AdminOrganizationListItem } from './organization-api'
import { OrganizationPlanBadge, OrganizationStatusBadge } from './OrganizationActionsMenu'

export type OrganizationRow = AdminOrganizationListItem & {
  subscription: SuperAdminSubscription | null
  planKey: string | null
  planLabel: string
}

type DrawerTab = 'overview' | 'users' | 'subscription' | 'activity'

type OrganizationDetailDrawerProps = {
  organization: OrganizationRow | null
  onClose: () => void
  onViewOrganization: (organization: OrganizationRow) => void
  onChangeStatus: (organization: OrganizationRow) => void
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
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

function formatDate(value: string | null | undefined, empty: string) {
  if (!value) return empty
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-dash-border py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <dt className="text-xs font-medium tracking-wide text-mute uppercase">{label}</dt>
      <dd className="min-w-0 text-sm font-medium break-all text-ink sm:text-right">{value}</dd>
    </div>
  )
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

export function OrganizationDetailDrawer({
  organization,
  onClose,
  onViewOrganization,
  onChangeStatus,
}: OrganizationDetailDrawerProps) {
  const t = useTranslations('admin.organizations')
  const [tab, setTab] = useState<DrawerTab>('overview')
  const [tabOrganizationId, setTabOrganizationId] = useState(organization?.id)

  if (organization?.id !== tabOrganizationId) {
    setTabOrganizationId(organization?.id)
    setTab('overview')
  }

  const empty = t('emptyValue')
  const open = Boolean(organization)

  const tabs: { id: DrawerTab; label: string }[] = [
    { id: 'overview', label: t('drawer.tabs.overview') },
    { id: 'users', label: t('drawer.tabs.users') },
    { id: 'subscription', label: t('drawer.tabs.subscription') },
    { id: 'activity', label: t('drawer.tabs.activity') },
  ]

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <SheetContent
        side="right"
        showCloseButton
        className={cn(
          'gap-0 bg-canvas p-0 text-ink shadow-[0_24px_80px_rgb(15_23_42/0.28)]',
          'data-[side=right]:w-full data-[side=right]:sm:max-w-lg data-[side=right]:lg:max-w-xl'
        )}
      >
        {organization ? (
          <>
            <SheetHeader className="shrink-0 border-b border-dash-border p-5 sm:p-6">
              <div className="flex items-start gap-3 pr-8">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-on-primary shadow-[0_6px_16px_rgb(159_232_112/0.35)]">
                  {getInitials(organization.name)}
                </span>
                <div className="min-w-0">
                  <SheetTitle className="font-display text-xl tracking-tight text-ink">
                    {organization.name}
                  </SheetTitle>
                  <SheetDescription className="mt-1 font-mono text-xs text-mute">
                    {organization.id}
                  </SheetDescription>
                  <div className="mt-2">
                    <OrganizationStatusBadge
                      status={organization.uiStatus}
                      label={t(`filters.status.${organization.uiStatus}`)}
                    />
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="shrink-0 overflow-x-auto border-b border-dash-border px-3 sm:px-4">
              <div className="flex min-w-max gap-1 py-2" role="tablist">
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.id}
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      tab === item.id
                        ? 'bg-primary-pale text-positive-deep'
                        : 'text-mute hover:bg-dash-surface hover:text-ink'
                    )}
                    onClick={() => setTab(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              {tab === 'overview' ? (
                <OverviewTab
                  organization={organization}
                  empty={empty}
                  onViewUsers={() => setTab('users')}
                  onViewSubscription={() => setTab('subscription')}
                  onViewOrganization={onViewOrganization}
                  onChangeStatus={onChangeStatus}
                />
              ) : null}
              {tab === 'users' ? <UsersTab /> : null}
              {tab === 'subscription' ? (
                <SubscriptionTab organization={organization} empty={empty} />
              ) : null}
              {tab === 'activity' ? (
                <ActivityTab organizationId={organization.id} empty={empty} />
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function OverviewTab({
  organization,
  empty,
  onViewUsers,
  onViewSubscription,
  onViewOrganization,
  onChangeStatus,
}: {
  organization: OrganizationRow
  empty: string
  onViewUsers: () => void
  onViewSubscription: () => void
  onViewOrganization: (organization: OrganizationRow) => void
  onChangeStatus: (organization: OrganizationRow) => void
}) {
  const t = useTranslations('admin.organizations')
  const website = organization.website

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-dash-border bg-dash-surface/40 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-ink">{t('drawer.overviewTitle')}</h3>
        <dl className="mt-1">
          <DetailRow label={t('drawer.fields.name')} value={organization.name} />
          <DetailRow label={t('drawer.fields.slug')} value={organization.slug} />
          <DetailRow label={t('drawer.fields.ownerEmail')} value={organization.email || empty} />
          <DetailRow label={t('drawer.fields.phone')} value={organization.phone || empty} />
          <DetailRow
            label={t('drawer.fields.website')}
            value={
              website ? (
                <a
                  href={website}
                  className="cursor-pointer text-positive-deep underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {website.replace(/^https?:\/\//, '')}
                </a>
              ) : (
                empty
              )
            }
          />
          <DetailRow label={t('drawer.fields.industry')} value={organization.industry || empty} />
          <DetailRow label={t('drawer.fields.country')} value={organization.country || empty} />
          <DetailRow label={t('drawer.fields.timezone')} value={organization.timezone || empty} />
          <DetailRow label={t('drawer.fields.currency')} value={organization.currency || empty} />
          <DetailRow
            label={t('drawer.fields.created')}
            value={formatDate(organization.createdAt, empty)}
          />
          <DetailRow
            label={t('drawer.fields.updated')}
            value={formatDate(organization.updatedAt, empty)}
          />
          <DetailRow
            label={t('drawer.fields.status')}
            value={t(`filters.status.${organization.uiStatus}`)}
          />
        </dl>
      </section>

      <section className="rounded-2xl border border-dash-border bg-dash-surface/40 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">{t('drawer.planTitle')}</h3>
            <p className="mt-1 text-lg font-semibold text-ink">{organization.planLabel}</p>
            {organization.subscription ? (
              <p className="mt-1 text-sm text-body">
                {planAmountLabel(organization.subscription.planId, empty)}
                {planBillingKind(organization.subscription.planId) === 'monthly'
                  ? ` / ${t('drawer.perMonth')}`
                  : ''}
              </p>
            ) : (
              <p className="mt-1 text-sm text-mute">{t('drawer.noPlan')}</p>
            )}
          </div>
          <OrganizationPlanBadge label={organization.planLabel} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 gap-2"
          onClick={onViewSubscription}
        >
          <CreditCard className="size-4" aria-hidden />
          {t('drawer.viewSubscription')}
        </Button>
      </section>

      <section className="rounded-2xl border border-dash-border bg-dash-surface/40 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-ink">{t('drawer.quickActions')}</h3>
        <div className="mt-3 grid gap-2">
          <Button
            type="button"
            variant="outline"
            className="justify-start gap-2"
            onClick={() => onViewOrganization(organization)}
          >
            <Building2 className="size-4" aria-hidden />
            {t('drawer.actions.viewOrganization')}
            <ExternalLink className="ml-auto size-3.5 text-mute" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="justify-start gap-2"
            onClick={onViewUsers}
          >
            <Users className="size-4" aria-hidden />
            {t('drawer.actions.viewUsers')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="justify-start gap-2"
            onClick={onViewSubscription}
          >
            <CreditCard className="size-4" aria-hidden />
            {t('drawer.actions.viewSubscription')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="justify-start gap-2"
            onClick={() => onChangeStatus(organization)}
          >
            {t('drawer.actions.changeStatus')}
          </Button>
        </div>
      </section>
    </div>
  )
}

function UsersTab() {
  const t = useTranslations('admin.organizations')
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border px-4 py-14 text-center">
      <Users className="size-8 text-mute" aria-hidden />
      <p className="text-sm font-medium text-ink">{t('drawer.usersUnavailableTitle')}</p>
      <p className="max-w-sm text-sm text-body">{t('drawer.usersUnavailable')}</p>
    </div>
  )
}

function SubscriptionTab({
  organization,
  empty,
}: {
  organization: OrganizationRow
  empty: string
}) {
  const t = useTranslations('admin.organizations')
  const subscription = organization.subscription

  if (!subscription) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border px-4 py-14 text-center">
        <CreditCard className="size-8 text-mute" aria-hidden />
        <p className="text-sm font-medium text-ink">{t('drawer.noPlan')}</p>
        <p className="max-w-sm text-sm text-body">{t('drawer.noPlanHint')}</p>
        <Link
          href="/admin/subscriptions"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')}
        >
          {t('drawer.manageSubscriptions')}
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-dash-border bg-dash-surface/40 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-ink">{t('drawer.planTitle')}</h3>
        <dl className="mt-1">
          <DetailRow label={t('columns.plan')} value={resolvePlanLabel(subscription.planId)} />
          <DetailRow
            label={t('drawer.fields.price')}
            value={planAmountLabel(subscription.planId, empty)}
          />
          <DetailRow
            label={t('drawer.fields.billing')}
            value={
              planBillingKind(subscription.planId) === 'monthly'
                ? t('drawer.monthly')
                : t('drawer.customBilling')
            }
          />
          <DetailRow label={t('drawer.fields.subStatus')} value={subscription.status} />
          <DetailRow
            label={t('drawer.fields.periodStart')}
            value={formatDate(subscription.currentPeriodStart, empty)}
          />
          <DetailRow
            label={t('drawer.fields.periodEnd')}
            value={formatDate(subscription.currentPeriodEnd, empty)}
          />
        </dl>
      </section>
      <Link
        href="/admin/subscriptions"
        className={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}
      >
        {t('drawer.manageSubscriptions')}
        <ExternalLink className="size-3.5" aria-hidden />
      </Link>
    </div>
  )
}

function ActivityTab({ organizationId, empty }: { organizationId: string; empty: string }) {
  const t = useTranslations('admin.organizations')
  const activityQuery = useQuery({
    queryKey: ['admin-org-activity', organizationId],
    queryFn: async () => {
      const { data } = await api.superAdmin.auditLogs.list({ limit: 50, organizationId })
      return unwrapAuditEvents(data)
    },
  })

  const events = activityQuery.data ?? []

  if (activityQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-body">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t('drawer.activityLoading')}
      </div>
    )
  }

  if (activityQuery.isError) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
      >
        {t('drawer.activityFailed')}
      </p>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border px-4 py-14 text-center">
        <ScrollText className="size-8 text-mute" aria-hidden />
        <p className="text-sm font-medium text-ink">{t('drawer.activityEmpty')}</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <li
          key={event.id}
          className="rounded-xl border border-dash-border bg-dash-surface/40 px-4 py-3"
        >
          <p className="text-sm font-medium text-ink">{event.eventType}</p>
          <p className="mt-1 text-xs text-mute">{formatDateTime(event.createdAt, empty)}</p>
          {event.reason ? <p className="mt-1 text-xs text-body">{event.reason}</p> : null}
        </li>
      ))}
    </ul>
  )
}
