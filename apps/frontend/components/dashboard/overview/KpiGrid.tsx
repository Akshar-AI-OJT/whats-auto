'use client'

import { Megaphone, MessageCircle, Send, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { MOCK_KPIS } from '../mock-data'
import { KPIStatCard } from './KPIStatCard'
import { ConnectWhatsAppButton } from '@/components/whatsapp/ConnectWhatsAppButton'

export function KpiGrid() {
  const t = useTranslations('dashboard.home.kpis')

  const items = [
    {
      key: 'contacts',
      icon: Users,
      value: MOCK_KPIS.totalContacts.value,
      delta: MOCK_KPIS.totalContacts.delta,
      trend: MOCK_KPIS.totalContacts.tone,
    },
    {
      key: 'conversations',
      icon: MessageCircle,
      value: MOCK_KPIS.activeConversations.value,
      delta: MOCK_KPIS.activeConversations.delta,
      trend: MOCK_KPIS.activeConversations.tone,
    },
    {
      key: 'campaigns',
      icon: Megaphone,
      value: MOCK_KPIS.campaignsSent.value,
      delta: MOCK_KPIS.campaignsSent.delta,
      trend: MOCK_KPIS.campaignsSent.tone,
    },
    {
      key: 'delivery',
      icon: Send,
      value: MOCK_KPIS.deliveryRate.value,
      delta: MOCK_KPIS.deliveryRate.delta,
      trend: MOCK_KPIS.deliveryRate.tone,
    },
  ] as const

  return (
    <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 xl:gap-5">
      {/* {items.map((item) => (
        <KPIStatCard
          key={item.key}
          label={t(`${item.key}.label`)}
          value={item.value}
          delta={item.delta}
          trend={item.trend}
          hint={t(`${item.key}.hint`)}
          icon={item.icon}
          className="h-full"
        />
      ))} */}

      {items.map((item) =>
        item.key === 'contacts' ? (
          <div key={item.key} className="flex h-full flex-col">
            <KPIStatCard
              label={t(`${item.key}.label`)}
              value={item.value}
              delta={item.delta}
              trend={item.trend}
              hint={t(`${item.key}.hint`)}
              icon={item.icon}
              className="h-auto flex-1"
            />
            {/* TEMP: remove after WhatsApp settings page exists */}
            <ConnectWhatsAppButton />
          </div>
        ) : (
          <KPIStatCard
            key={item.key}
            label={t(`${item.key}.label`)}
            value={item.value}
            delta={item.delta}
            trend={item.trend}
            hint={t(`${item.key}.hint`)}
            icon={item.icon}
            className="h-full"
          />
        )
      )}
    </div>
  )
}
