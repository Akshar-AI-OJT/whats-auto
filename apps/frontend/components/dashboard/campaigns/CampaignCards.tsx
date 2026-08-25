'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Megaphone, MoreVertical } from 'lucide-react'
import type { Campaign } from '@/lib/api'
import { CampaignStatusBadge } from './CampaignStatusBadge'
import { formatCampaignDate, ratePercent } from './campaign-utils'

type CampaignActionsMenuProps = {
  campaign: Campaign
  canEdit: boolean
  canCreate?: boolean
  canDelete: boolean
  canPause?: boolean
  onView: () => void
  onEdit: () => void
  onDuplicate: () => void
  onChangeStatus?: () => void
  onPause: () => void
  onDelete: () => void
}

export function CampaignActionsMenu({
  campaign,
  canEdit,
  canCreate = canEdit,
  canDelete,
  canPause = false,
  onView,
  onEdit,
  onDuplicate,
  onChangeStatus,
  onPause,
  onDelete,
}: CampaignActionsMenuProps) {
  const t = useTranslations('dashboard.campaigns.actions')
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonId = useId()
  const editable = campaign.status === 'draft' || campaign.status === 'scheduled'
  const cancellable = campaign.status === 'scheduled' || campaign.status === 'sending'

  useEffect(() => {
    if (!open) return
    function handlePointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div className="relative" ref={menuRef}>
      <button
        id={buttonId}
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-lg text-mute transition-colors hover:bg-dash-surface hover:text-ink"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('menuAria')}
        onClick={() => setOpen((prev) => !prev)}
      >
        <MoreVertical className="size-4" aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          aria-labelledby={buttonId}
          className="absolute top-9 right-0 z-20 min-w-[11rem] overflow-hidden rounded-xl border border-dash-border bg-canvas py-1 shadow-[0_12px_30px_rgb(15_23_42/0.12)]"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
            onClick={() => {
              setOpen(false)
              onView()
            }}
          >
            {t('view')}
          </button>
          {canEdit && editable ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
              onClick={() => {
                setOpen(false)
                onEdit()
              }}
            >
              {t('edit')}
            </button>
          ) : null}
          {canEdit && editable && onChangeStatus ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
              onClick={() => {
                setOpen(false)
                onChangeStatus()
              }}
            >
              {t('changeStatus')}
            </button>
          ) : null}
          {canCreate ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
              onClick={() => {
                setOpen(false)
                onDuplicate()
              }}
            >
              {t('duplicate')}
            </button>
          ) : null}
          {canPause && cancellable ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
              onClick={() => {
                setOpen(false)
                onPause()
              }}
            >
              {t('cancel')}
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-negative hover:bg-dash-surface"
              onClick={() => {
                setOpen(false)
                onDelete()
              }}
            >
              {t('delete')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type CampaignCardsProps = {
  campaigns: Campaign[]
  templateNames: Record<string, string>
  canEdit: boolean
  canCreate?: boolean
  canDelete: boolean
  canPause?: boolean
  onView: (campaign: Campaign) => void
  onEdit: (campaign: Campaign) => void
  onDuplicate: (campaign: Campaign) => void
  onChangeStatus?: (campaign: Campaign) => void
  onPause: (campaign: Campaign) => void
  onDelete: (campaign: Campaign) => void
}

export function CampaignCards({
  campaigns,
  templateNames,
  canEdit,
  canCreate = canEdit,
  canDelete,
  canPause = false,
  onView,
  onEdit,
  onDuplicate,
  onChangeStatus,
  onPause,
  onDelete,
}: CampaignCardsProps) {
  const t = useTranslations('dashboard.campaigns')

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {campaigns.map((campaign) => {
        const delivery = ratePercent(campaign.deliveredCount, campaign.totalRecipients)
        const read = ratePercent(campaign.readCount, campaign.totalRecipients)
        const templateLabel = campaign.messageTemplateId
          ? (templateNames[campaign.messageTemplateId] ?? campaign.messageTemplateId)
          : t('noTemplate')

        return (
          <article
            key={campaign.id}
            className="flex flex-col rounded-2xl border border-dash-border bg-canvas p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-pale text-positive-deep">
                <Megaphone className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onView(campaign)}
                    className="cursor-pointer truncate text-left font-semibold text-ink hover:underline"
                  >
                    {campaign.name}
                  </button>
                  <CampaignActionsMenu
                    campaign={campaign}
                    canEdit={canEdit}
                    canCreate={canCreate}
                    canDelete={canDelete}
                    canPause={canPause}
                    onView={() => onView(campaign)}
                    onEdit={() => onEdit(campaign)}
                    onDuplicate={() => onDuplicate(campaign)}
                    onChangeStatus={
                      onChangeStatus ? () => onChangeStatus(campaign) : undefined
                    }
                    onPause={() => onPause(campaign)}
                    onDelete={() => onDelete(campaign)}
                  />
                </div>
                <span className="mt-1 inline-flex rounded-full bg-primary-pale px-2 py-0.5 text-[11px] font-semibold tracking-wide text-positive-deep uppercase">
                  {t('type.broadcast')}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-semibold tracking-wide text-mute uppercase">
                {t('card.template')}
              </p>
              <p className="mt-1 truncate text-sm text-ink">{templateLabel}</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-dash-border pt-4">
              <div>
                <p className="text-xs text-mute">{t('card.deliveryRate')}</p>
                <p className="mt-1 text-lg font-semibold text-ink">{delivery}%</p>
                <p className="text-xs text-mute">
                  {campaign.deliveredCount.toLocaleString()} /{' '}
                  {campaign.totalRecipients.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-mute">{t('card.readRate')}</p>
                <p className="mt-1 text-lg font-semibold text-ink">{read}%</p>
                <p className="text-xs text-mute">
                  {campaign.readCount.toLocaleString()} /{' '}
                  {campaign.totalRecipients.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-dash-border pt-3">
              <CampaignStatusBadge status={campaign.status} />
              <p className="text-xs text-mute">
                {formatCampaignDate(campaign.scheduledAt ?? campaign.createdAt)}
              </p>
            </div>
          </article>
        )
      })}
    </div>
  )
}
