'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { FileText, MoreVertical } from 'lucide-react'
import type { WhatsappMessageTemplate } from '@/lib/api'
import { cn } from '@/lib/utils'
import { TemplateStatusBadge } from './TemplateStatusBadge'
import {
  formatHeaderType,
  formatRelativeDate,
  formatTemplateCategory,
  formatTemplateLanguage,
  truncatePreview,
} from './template-utils'

type TemplateTableProps = {
  templates: WhatsappMessageTemplate[]
  onView: (template: WhatsappMessageTemplate) => void
  onDuplicate: (template: WhatsappMessageTemplate) => void
  onDelete: (template: WhatsappMessageTemplate) => void
  canManage: boolean
}

function useStatusLabel(status: string) {
  const t = useTranslations('dashboard.templates.status')
  const key = status.toLowerCase()
  if (key === 'approved') return t('approved')
  if (key === 'pending') return t('pending')
  if (key === 'rejected') return t('rejected')
  if (key === 'draft') return t('draft')
  return status
}

function RowActions({
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
        onClick={() => setOpen((prev) => !prev)}
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
            onClick={() => {
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
              onClick={() => {
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

function TemplateRow({
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
  const statusLabel = useStatusLabel(template.status)

  return (
    <tr className={cn('transition-colors hover:bg-dash-surface/40')}>
      <td className="px-4 py-3.5">
        <button type="button" className="flex min-w-0 items-start gap-3 text-left" onClick={onView}>
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-pale text-positive-deep">
            <FileText className="size-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-ink">{template.name}</span>
            <span className="mt-0.5 line-clamp-1 block text-xs text-mute">
              {truncatePreview(template.bodyText, 80)}
            </span>
          </span>
        </button>
      </td>
      <td className="px-4 py-3.5 text-body">{formatTemplateCategory(String(template.category))}</td>
      <td className="px-4 py-3.5 text-body">{formatTemplateLanguage(template.language)}</td>
      <td className="px-4 py-3.5 text-body">{formatHeaderType(template.headerType)}</td>
      <td className="px-4 py-3.5">
        <TemplateStatusBadge status={template.status} label={statusLabel} />
      </td>
      <td className="px-4 py-3.5 text-body">
        {template.qualityScore ? template.qualityScore : t('table.qualityEmpty')}
      </td>
      <td className="px-4 py-3.5 text-body">
        {formatRelativeDate(template.updatedAt ?? template.createdAt)}
      </td>
      <td className="px-4 py-3.5 text-right">
        <RowActions
          canManage={canManage}
          onView={onView}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      </td>
    </tr>
  )
}

export function TemplateTable({
  templates,
  onView,
  onDuplicate,
  onDelete,
  canManage,
}: TemplateTableProps) {
  const t = useTranslations('dashboard.templates')

  return (
    <div className="overflow-x-auto rounded-2xl border border-dash-border">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-dash-surface/60 text-xs tracking-wide text-mute uppercase">
          <tr>
            <th className="px-4 py-3 font-semibold">{t('table.template')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.category')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.language')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.header')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.status')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.quality')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.updated')}</th>
            <th className="px-4 py-3 font-semibold">
              <span className="sr-only">{t('table.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dash-border bg-canvas">
          {templates.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              canManage={canManage}
              onView={() => onView(template)}
              onDuplicate={() => onDuplicate(template)}
              onDelete={() => onDelete(template)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
