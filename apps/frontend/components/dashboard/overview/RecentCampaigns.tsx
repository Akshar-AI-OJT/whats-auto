'use client'

import { Megaphone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { formatCampaignDate } from '@/components/dashboard/campaigns/campaign-utils'
import { DashboardPanel } from '../ui/DashboardPanel'
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader'
import { useDashboardOverview } from './DashboardOverviewProvider'
import { PanelError, PanelLoading } from './DashboardSectionState'
import { DashboardEmptyState } from './DashboardEmptyState'
import { CampaignCard } from './CampaignCard'
import {
  campaignCardDeliveryPercent,
  campaignCardProgress,
  mapCampaignCardStatus,
} from './dashboard-overview-data'

export function RecentCampaigns() {
  const t = useTranslations('dashboard.home')
  const router = useRouter()
  const { campaigns, campaignsLoading, campaignsError, refetchCampaigns, orgsLoading } =
    useDashboardOverview()

  const loading = campaignsLoading || orgsLoading

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader
        title={t('campaigns.title')}
        description={t('campaigns.description')}
      />

      {loading ? (
        <PanelLoading label={t('loading.campaigns')} />
      ) : campaignsError ? (
        <PanelError
          label={t('errors.campaigns')}
          retryLabel={t('retry')}
          retry={refetchCampaigns}
        />
      ) : campaigns.length === 0 ? (
        <DashboardEmptyState
          icon={<Megaphone className="size-5" aria-hidden />}
          title={t('campaigns.emptyTitle')}
          description={t('campaigns.emptyDescription')}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {campaigns.map((campaign) => {
            const cardStatus = mapCampaignCardStatus(String(campaign.status))
            const statusLabel = t(`campaigns.status.${cardStatus}`)
            const progressLabel = t(`campaigns.progress.${cardStatus}`)

            return (
              <CampaignCard
                key={campaign.id}
                id={campaign.id}
                name={campaign.name}
                status={cardStatus}
                statusLabel={statusLabel}
                when={formatCampaignDate(campaign.scheduledAt ?? campaign.createdAt)}
                sentLabel={t('campaigns.sent')}
                deliveredLabel={t('campaigns.delivered')}
                progressLabel={progressLabel}
                sent={Number(campaign.sentCount ?? 0).toLocaleString()}
                deliveredPercent={campaignCardDeliveryPercent(campaign)}
                progress={campaignCardProgress(campaign)}
                onClick={() => router.push(`/dashboard/campaigns/${campaign.id}`)}
                actions={[
                  {
                    id: 'view',
                    label: t('campaigns.actions.view'),
                    onSelect: () => router.push(`/dashboard/campaigns/${campaign.id}`),
                  },
                ]}
              />
            )
          })}
        </div>
      )}
    </DashboardPanel>
  )
}
