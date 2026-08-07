'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  draft: 'border-dash-border bg-dash-surface text-body',
  scheduled: 'border-warning/30 bg-warning/10 text-warning-deep',
  sending: 'border-dash-info/25 bg-dash-info-soft text-dash-info',
  sent: 'border-positive/25 bg-positive/10 text-positive-deep',
  failed: 'border-negative/25 bg-negative/10 text-negative',
}

type CampaignStatusBadgeProps = {
  status: string
  className?: string
}

export function CampaignStatusBadge({ status, className }: CampaignStatusBadgeProps) {
  const t = useTranslations('dashboard.campaigns.status')
  const key = status in STATUS_STYLES ? status : 'draft'
  let label = status
  if (status === 'sent') label = t('completed')
  else if (status === 'sending') label = t('processing')
  else if (status === 'draft') label = t('draft')
  else if (status === 'scheduled') label = t('scheduled')
  else if (status === 'failed') label = t('failed')

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
        STATUS_STYLES[key] ?? STATUS_STYLES.draft,
        className
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          status === 'sent' && 'bg-positive',
          status === 'scheduled' && 'bg-warning-deep',
          status === 'draft' && 'bg-mute',
          status === 'sending' && 'bg-dash-info',
          status === 'failed' && 'bg-negative',
          !['sent', 'scheduled', 'draft', 'sending', 'failed'].includes(status) && 'bg-mute'
        )}
        aria-hidden
      />
      {label}
    </span>
  )
}
