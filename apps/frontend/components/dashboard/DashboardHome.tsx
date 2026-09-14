'use client'

import { useTranslations } from 'next-intl'
import { useAuth } from '@/hooks/useAuth'
import { OnboardingChecklist } from './overview/OnboardingChecklist'
import { ConnectWhatsappCard } from './overview/ConnectWhatsappCard'
import { ProfileCompletionReminder } from './overview/ProfileCompletionReminder'
import { WelcomeSection } from './overview/WelcomeSection'
import { KpiGrid } from './overview/KpiGrid'
import { RecentConversations } from './overview/RecentConversations'
import { RecentCampaigns } from './overview/RecentCampaigns'
import { QuickActions } from './overview/QuickActions'
import { RecentActivity } from './overview/RecentActivity'
import { DashboardOverviewProvider } from './overview/DashboardOverviewProvider'

export function DashboardHome() {
  const t = useTranslations('dashboard')
  const tHome = useTranslations('dashboard.home')
  const { isLoading } = useAuth()

  if (isLoading) {
    return <p className="text-sm text-mute">{t('loading')}</p>
  }

  return (
    <DashboardOverviewProvider noDetailsLabel={tHome('activity.noDetails')}>
      <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6 xl:gap-7">
        <WelcomeSection />
        <ProfileCompletionReminder />
        <OnboardingChecklist />
        <ConnectWhatsappCard />
        <KpiGrid />

        {/* Stack on mobile + tablet; side-by-side from xl (desktop) */}
        <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-12 xl:gap-6">
          <div className="min-w-0 xl:col-span-7">
            <RecentConversations />
          </div>
          <div className="min-w-0 xl:col-span-5">
            <RecentCampaigns />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-12 xl:gap-6">
          <div className="min-w-0 xl:col-span-7">
            <QuickActions />
          </div>
          <div className="min-w-0 xl:col-span-5">
            <RecentActivity />
          </div>
        </div>
      </div>
    </DashboardOverviewProvider>
  )
}
