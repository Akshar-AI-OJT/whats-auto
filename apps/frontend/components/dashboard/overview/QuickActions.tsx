'use client'

import { FileText, Inbox, Megaphone, UserPlus, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DashboardPanel } from '../ui/DashboardPanel'
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader'
import { QuickActionCard } from './QuickActionCard'
import { useOrganizations } from '../OrganizationsProvider'

const QUICK_ACTIONS = [
  {
    id: 'new-campaign',
    titleKey: 'newCampaign',
    descriptionKey: 'newCampaignDesc',
    href: '/dashboard/campaigns/create',
  },
  {
    id: 'add-contact',
    titleKey: 'addContact',
    descriptionKey: 'addContactDesc',
    href: '/dashboard/contacts?add=1',
  },
  {
    id: 'create-template',
    titleKey: 'createTemplate',
    descriptionKey: 'createTemplateDesc',
    href: '/dashboard/templates/create',
  },
  {
    id: 'inbox',
    titleKey: 'inbox',
    descriptionKey: 'inboxDesc',
    href: '/dashboard/inbox',
  },
] as const

const ACTION_ICONS: Record<(typeof QUICK_ACTIONS)[number]['titleKey'], LucideIcon> = {
  newCampaign: Megaphone,
  addContact: UserPlus,
  createTemplate: FileText,
  inbox: Inbox,
}

export function QuickActions() {
  const t = useTranslations('dashboard.home.quickActions')
  const { canViewInbox, isLoading: orgsLoading } = useOrganizations()

  return (
    <DashboardPanel as="section" className="flex h-full flex-col p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={t('title')} description={t('description')} />

      <div className="mt-5 grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2">
        {QUICK_ACTIONS.filter((action) => {
          if (action.id !== 'inbox') return true
          return !orgsLoading && canViewInbox
        }).map((action) => {
          const Icon = ACTION_ICONS[action.titleKey]
          return (
            <QuickActionCard
              key={action.id}
              href={action.href}
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
