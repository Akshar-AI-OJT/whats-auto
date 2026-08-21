'use client'

import { useTranslations } from 'next-intl'
import { Megaphone } from 'lucide-react'
import type { Campaign } from '@/lib/api'
import { CampaignActionsMenu } from './CampaignCards'
import { CampaignStatusBadge } from './CampaignStatusBadge'
import { formatCampaignDate, ratePercent } from './campaign-utils'

type CampaignTableProps = {
  campaigns: Campaign[]
  templateNames: Record<string, string>
  canEdit: boolean
  canCreate?: boolean
  canDelete: boolean
  canPause?: boolean
  onView: (campaign: Campaign) => void
  onEdit: (campaign: Campaign) => void
  onDuplicate: (campaign: Campaign) => void
  onPause: (campaign: Campaign) => void
  onDelete: (campaign: Campaign) => void
  timeZone?: string | null
}

export function CampaignTable({
  campaigns,
  templateNames,
  canEdit,
  canCreate = canEdit,
  canDelete,
  canPause = false,
  onView,
  onEdit,
  onDuplicate,
  onPause,
  onDelete,
  timeZone,
}: CampaignTableProps) {
  const t = useTranslations('dashboard.campaigns')

  return (
    <div className="overflow-x-auto rounded-2xl border border-dash-border">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-dash-border bg-dash-surface/70 text-xs tracking-wide text-mute uppercase">
          <tr>
            <th className="px-4 py-3 font-semibold">{t('table.campaign')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.type')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.template')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.status')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.recipients')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.sent')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.delivered')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.read')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.created')}</th>
            <th className="px-4 py-3 font-semibold">
              <span className="sr-only">{t('table.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => {
            const delivery = ratePercent(campaign.deliveredCount, campaign.totalRecipients)
            const read = ratePercent(campaign.readCount, campaign.totalRecipients)
            const templateLabel = campaign.messageTemplateId
              ? (templateNames[campaign.messageTemplateId] ?? campaign.messageTemplateId)
              : t('noTemplate')

            return (
              <tr
                key={campaign.id}
                className="border-b border-dash-border last:border-0 hover:bg-dash-hover/60"
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onView(campaign)}
                    className="flex items-center gap-2 text-left font-medium text-ink hover:underline"
                  >
                    <span className="flex size-8 items-center justify-center rounded-lg bg-primary-pale text-positive-deep">
                      <Megaphone className="size-3.5" aria-hidden />
                    </span>
                    <span className="max-w-[14rem] truncate">{campaign.name}</span>
                  </button>
                </td>
                <td className="px-4 py-3 text-body">{t('type.broadcast')}</td>
                <td className="max-w-[10rem] truncate px-4 py-3 text-body">{templateLabel}</td>
                <td className="px-4 py-3">
                  <CampaignStatusBadge status={campaign.status} />
                </td>
                <td className="px-4 py-3 text-body">
                  {campaign.totalRecipients.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-body">{campaign.sentCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-body">
                  {campaign.deliveredCount.toLocaleString()}
                  <span className="text-mute"> ({delivery}%)</span>
                </td>
                <td className="px-4 py-3 text-body">
                  {campaign.readCount.toLocaleString()}
                  <span className="text-mute"> ({read}%)</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-body">
                  {formatCampaignDate(campaign.createdAt, timeZone)}
                </td>
                <td className="px-4 py-3 text-right">
                  <CampaignActionsMenu
                    campaign={campaign}
                    canEdit={canEdit}
                    canCreate={canCreate}
                    canDelete={canDelete}
                    canPause={canPause}
                    onView={() => onView(campaign)}
                    onEdit={() => onEdit(campaign)}
                    onDuplicate={() => onDuplicate(campaign)}
                    onPause={() => onPause(campaign)}
                    onDelete={() => onDelete(campaign)}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
