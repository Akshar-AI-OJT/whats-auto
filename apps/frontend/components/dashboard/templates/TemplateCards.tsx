'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { FileText, MoreVertical } from 'lucide-react'
import type { WhatsappMessageTemplate } from '@/lib/api'
import { TemplateStatusBadge } from './TemplateStatusBadge'
import {
  formatHeaderType,
  formatRelativeDate,
  formatTemplateCategory,
  formatTemplateLanguage,
  truncatePreview,
} from './template-utils'

type TemplateCardsProps = {
  templates: WhatsappMessageTemplate[]
  onView: (template: WhatsappMessageTemplate) => void
  onDuplicate: (template: WhatsappMessageTemplate) => void
  onDelete: (template: WhatsappMessageTemplate) => void
  canManage: boolean
}

function statusLabelKey(status: string) {
  const key = status.toLowerCase()
  if (key === 'approved' || key === 'pending' || key === 'rejected' || key === 'draft') {
    return key
  }
  return null
}

function CardActions({
  canManage,
  onView,
  onDuplicate,
  onDelete,
}: {
  canManage: boolean
  onView: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const t = useTranslations('dashboard.templates.actions')
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonId = useId()

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
        onClick={(e) => {
          e.stopPropagation()
          setOpen((prev) => !prev)
        }}
      >
        <MoreVertical className="size-4" aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          aria-labelledby={buttonId}
          className="absolute top-9 right-0 z-20 min-w-[10rem] overflow-hidden rounded-xl border border-dash-border bg-canvas py-1 shadow-[0_12px_30px_rgb(15_23_42/0.12)]"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
              onView()
            }}
          >
            {t('view')}
          </button>
          {canManage ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-dash-surface"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onDuplicate()
              }}
            >
              {t('duplicate')}
            </button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-negative hover:bg-negative/5"
              onClick={(e) => {
                e.stopPropagation()
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

function TemplateCard({
  template,
  canManage,
  onView,
  onDuplicate,
  onDelete,
}: {
  template: WhatsappMessageTemplate
  canManage: boolean
  onView: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const t = useTranslations('dashboard.templates')
  const key = statusLabelKey(template.status)
  const statusLabel = key ? t(`status.${key}`) : template.status

  return (
    <article className="flex flex-col rounded-2xl border border-dash-border bg-canvas p-4 transition-colors hover:border-dash-border-strong">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          onClick={onView}
        >
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-pale text-positive-deep">
            <FileText className="size-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{template.name}</span>
            <span className="mt-1 line-clamp-2 block text-xs leading-5 text-mute">
              {truncatePreview(template.bodyText, 110)}
            </span>
          </span>
        </button>
        <CardActions
          canManage={canManage}
          onView={onView}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <TemplateStatusBadge status={template.status} label={statusLabel} />
        <span className="rounded-md bg-dash-surface px-2 py-0.5 text-[11px] font-semibold text-body">
          {formatTemplateCategory(String(template.category))}
        </span>
        <span className="rounded-md bg-dash-surface px-2 py-0.5 text-[11px] font-medium text-body">
          {formatTemplateLanguage(template.language)}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-mute">{t('table.header')}</dt>
          <dd className="mt-0.5 font-medium text-ink">{formatHeaderType(template.headerType)}</dd>
        </div>
        <div>
          <dt className="text-mute">{t('table.quality')}</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {template.qualityScore || t('table.qualityEmpty')}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-mute">{t('table.updated')}</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {formatRelativeDate(template.updatedAt ?? template.createdAt)}
          </dd>
        </div>
      </dl>
    </article>
  )
}

export function TemplateCards({
  templates,
  onView,
  onDuplicate,
  onDelete,
  canManage,
}: TemplateCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          canManage={canManage}
          onView={() => onView(template)}
          onDuplicate={() => onDuplicate(template)}
          onDelete={() => onDelete(template)}
        />
      ))}
    </div>
  )
}
