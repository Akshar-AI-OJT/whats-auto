'use client'

import { Copy, Eye, PauseCircle, Pencil, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { MOCK_CAMPAIGNS } from '../mock-data'
import { DashboardPanel } from '../ui/DashboardPanel'
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader'
import { CampaignCard, type CampaignCardAction } from './CampaignCard'

function useCampaignActions(): CampaignCardAction[] {
  const t = useTranslations('dashboard.home.campaigns.actions')

  return [
    { id: 'view', label: t('view'), icon: <Eye /> },
    { id: 'edit', label: t('edit'), icon: <Pencil /> },
    { id: 'duplicate', label: t('duplicate'), icon: <Copy /> },
    { id: 'pause', label: t('pause'), icon: <PauseCircle /> },
    {
      id: 'delete',
      label: t('delete'),
      icon: <Trash2 />,
      tone: 'danger',
    },
  ]
}

export function RecentCampaigns() {
  const t = useTranslations('dashboard.home')
  const actions = useCampaignActions()

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader
        title={t('campaigns.title')}
        description={t('campaigns.description')}
      />

      <ul className="mt-5 flex flex-1 flex-col gap-2.5">
        {MOCK_CAMPAIGNS.map((item) => (
          <li key={item.id}>
            <CampaignCard
              id={item.id}
              name={item.name}
              status={item.status}
              statusLabel={t(`campaigns.status.${item.status}`)}
              when={item.when}
              sentLabel={t('campaigns.sent')}
              deliveredLabel={t('campaigns.delivered')}
              progressLabel={t(`campaigns.progress.${item.status}`)}
              sent={item.sent}
              deliveredPercent={item.deliveredPercent}
              progress={item.progress}
              actions={actions}
            />
          </li>
        ))}
      </ul>
    </DashboardPanel>
  )
}
