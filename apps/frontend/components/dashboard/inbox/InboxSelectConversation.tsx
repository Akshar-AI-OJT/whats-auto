'use client'

import { useTranslations } from 'next-intl'
import { MessageCircle } from 'lucide-react'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'

export function InboxSelectConversation() {
  const t = useTranslations('dashboard.inbox.thread')

  return (
    <DashboardPanel
      as="section"
      className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-3 rounded-[18px] border border-dash-border px-6 py-12 text-center shadow-[0_1px_3px_rgb(15_23_42/0.06)]"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
        <MessageCircle className="size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">{t('selectTitle')}</p>
        <p className="max-w-sm text-sm leading-5 text-mute">{t('selectDescription')}</p>
      </div>
    </DashboardPanel>
  )
}
