import { getTranslations } from 'next-intl/server'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { AdminKpiGrid } from './overview/AdminKpiGrid'
import { AdminRecentActivity } from './overview/AdminRecentActivity'
import { OrganizationGrowthChart } from './overview/OrganizationGrowthChart'
import { RevenueTrendChart } from './overview/RevenueTrendChart'
import { SubscriptionDistributionChart } from './overview/SubscriptionDistributionChart'

export async function AdminDashboardPage() {
  const t = await getTranslations('admin.home')

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6 xl:gap-7">
      <DashboardPanel
        as="section"
        className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-primary-pale/80 blur-[70px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 left-10 size-40 rounded-full bg-canvas-soft/80 blur-[60px]"
        />
        <div className="relative">
          <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl md:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-body sm:text-base sm:leading-7">
            {t('subtitle')}
          </p>
        </div>
      </DashboardPanel>

      <AdminKpiGrid />

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-12 xl:gap-6">
        <div className="min-w-0 xl:col-span-7">
          <OrganizationGrowthChart />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <SubscriptionDistributionChart />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-12 xl:gap-6">
        <div className="min-w-0 xl:col-span-7">
          <RevenueTrendChart />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <AdminRecentActivity />
        </div>
      </div>
    </div>
  )
}
