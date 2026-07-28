import { Check, Infinity } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import {
  MOCK_PLATFORM_PLANS,
  type MockPlatformPlan,
} from '../mock-data'

function formatLimit(
  value: number | null,
  unlimitedLabel: string,
  formatter?: (n: number) => string
) {
  if (value == null) return unlimitedLabel
  return formatter ? formatter(value) : value.toLocaleString('en-US')
}

function PlanCard({
  plan,
  labels,
}: {
  plan: MockPlatformPlan
  labels: {
    name: string
    description: string
    perMonth: string
    customPrice: string
    users: string
    messages: string
    workspaces: string
    features: string
    unlimited: string
    activeOrgs: string
    popular: string
    featureItems: Record<string, string>
  }
}) {
  const priceLabel =
    plan.priceMonthly == null
      ? labels.customPrice
      : `$${plan.priceMonthly.toLocaleString('en-US')}`

  return (
    <DashboardPanel
      as="article"
      className={cn(
        'group relative flex h-full flex-col overflow-hidden p-5 sm:p-6',
        'transition-[transform,box-shadow,border-color] duration-200 ease-out',
        'hover:-translate-y-0.5 hover:border-dash-border-strong hover:dash-elevated-shadow',
        plan.highlighted && 'border-primary/45 shadow-[0_0_0_1px_rgb(159_232_112/0.28)]'
      )}
    >
      {plan.highlighted ? (
        <span className="absolute top-4 right-4 rounded-lg bg-primary-pale px-2 py-0.5 text-[11px] font-semibold text-positive-deep ring-1 ring-primary/30">
          {labels.popular}
        </span>
      ) : null}

      <div className="min-w-0 pr-16">
        <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
          {labels.name}
        </h3>
        <p className="mt-1.5 text-sm leading-6 text-mute">{labels.description}</p>
      </div>

      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="font-display text-3xl font-semibold tracking-tight text-ink tabular-nums sm:text-4xl">
          {priceLabel}
        </span>
        {plan.priceMonthly != null ? (
          <span className="text-sm text-mute">{labels.perMonth}</span>
        ) : null}
      </div>

      <p className="mt-2 text-xs font-medium text-mute">{labels.activeOrgs}</p>

      <dl className="mt-5 grid gap-2.5 rounded-2xl border border-dash-border bg-dash-surface/70 p-3.5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-mute">{labels.users}</dt>
          <dd className="inline-flex items-center gap-1 font-semibold tabular-nums text-ink">
            {plan.userLimit == null ? (
              <>
                <Infinity className="size-3.5 text-positive-deep" aria-hidden />
                {labels.unlimited}
              </>
            ) : (
              plan.userLimit.toLocaleString('en-US')
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-mute">{labels.messages}</dt>
          <dd className="font-semibold tabular-nums text-ink">
            {formatLimit(plan.messageLimit, labels.unlimited)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-mute">{labels.workspaces}</dt>
          <dd className="font-semibold tabular-nums text-ink">
            {formatLimit(plan.workspaceLimit, labels.unlimited)}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <p className="text-xs font-semibold tracking-wide text-mute uppercase">
          {labels.features}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {plan.featureKeys.map((key) => (
            <li key={key} className="flex items-start gap-2.5 text-sm text-body">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-primary-pale text-positive-deep">
                <Check className="size-3.5" aria-hidden />
              </span>
              <span>{labels.featureItems[key] ?? key}</span>
            </li>
          ))}
        </ul>
      </div>
    </DashboardPanel>
  )
}

export async function SubscriptionsPage() {
  const t = await getTranslations('admin.subscriptions')

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6">
      <DashboardPanel
        as="section"
        className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-primary-pale/80 blur-[70px]"
        />
        <div className="relative">
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
      </DashboardPanel>

      <section className="flex flex-col gap-4">
        <DashboardSectionHeader
          title={t('plansTitle')}
          description={t('plansDescription')}
        />

        <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
          {MOCK_PLATFORM_PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              labels={{
                name: t(`plans.${plan.id}.name`),
                description: t(`plans.${plan.id}.description`),
                perMonth: t('perMonth'),
                customPrice: t('customPrice'),
                users: t('limits.users'),
                messages: t('limits.messages'),
                workspaces: t('limits.workspaces'),
                features: t('featuresLabel'),
                unlimited: t('unlimited'),
                activeOrgs: t('activeOrgs', { count: plan.activeOrgs }),
                popular: t('popular'),
                featureItems: {
                  inbox: t('features.inbox'),
                  basicCampaigns: t('features.basicCampaigns'),
                  campaigns: t('features.campaigns'),
                  templates: t('features.templates'),
                  emailSupport: t('features.emailSupport'),
                  automation: t('features.automation'),
                  analytics: t('features.analytics'),
                  prioritySupport: t('features.prioritySupport'),
                  webhooks: t('features.webhooks'),
                  roles: t('features.roles'),
                  sso: t('features.sso'),
                  dedicatedSupport: t('features.dedicatedSupport'),
                  sla: t('features.sla'),
                },
              }}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
