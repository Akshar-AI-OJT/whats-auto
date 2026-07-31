'use client'

import { FileText, Megaphone, Send, UserPlus, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DashboardPanel } from '../ui/DashboardPanel'
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader'
import { QuickActionCard } from './QuickActionCard'

const QUICK_ACTIONS = [
  {
    id: 'new-campaign',
    titleKey: 'newCampaign',
    descriptionKey: 'newCampaignDesc',
  },
  {
    id: 'add-contact',
    titleKey: 'addContact',
    descriptionKey: 'addContactDesc',
  },
  {
    id: 'create-template',
    titleKey: 'createTemplate',
    descriptionKey: 'createTemplateDesc',
  },
  {
    id: 'broadcast-message',
    titleKey: 'broadcastMessage',
    descriptionKey: 'broadcastMessageDesc',
  },
] as const

const ACTION_ICONS: Record<(typeof QUICK_ACTIONS)[number]['titleKey'], LucideIcon> = {
  newCampaign: Megaphone,
  addContact: UserPlus,
  createTemplate: FileText,
  broadcastMessage: Send,
}

export function QuickActions() {
  const t = useTranslations('dashboard.home.quickActions')

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />

      <div className="mt-5 grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2">
        {QUICK_ACTIONS.map((action) => {
          const Icon = ACTION_ICONS[action.titleKey]
          return (
            <QuickActionCard
              key={action.id}
              title={t(action.titleKey)}
              description={t(action.descriptionKey)}
              icon={Icon}
            />
          )
        })}
      </div>
    </DashboardPanel>
  )
}
