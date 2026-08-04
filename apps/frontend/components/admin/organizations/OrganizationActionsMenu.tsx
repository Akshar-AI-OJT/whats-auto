'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  Eye,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  PlayCircle,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { OrganizationStatus } from '../mock-data'
import type { AdminOrganizationListItem } from './organization-api'

export type OrganizationActionId = 'view' | 'edit' | 'suspend' | 'activate' | 'delete'

type OrganizationActionsMenuProps = {
  organization: AdminOrganizationListItem
  onAction: (action: OrganizationActionId, organization: AdminOrganizationListItem) => void
}

export function OrganizationActionsMenu({
  organization,
  onAction,
}: OrganizationActionsMenuProps) {
  const t = useTranslations('admin.organizations.actions')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const actions: {
    id: OrganizationActionId
    label: string
    icon: React.ReactNode
    tone?: 'danger'
    hidden?: boolean
  }[] = [
    {
      id: 'view',
      label: t('view'),
      icon: <Eye />,
    },
    {
      id: 'edit',
      label: t('edit'),
      icon: <Pencil />,
    },
    {
      id: 'suspend',
      label: t('suspend'),
      icon: <PauseCircle />,
      hidden: organization.uiStatus === 'suspended',
    },
    {
      id: 'activate',
      label: t('activate'),
      icon: <PlayCircle />,
      hidden: organization.uiStatus !== 'suspended',
    },
    {
      id: 'delete',
      label: t('delete'),
      icon: <Trash2 />,
      tone: 'danger',
    },
  ]

  return (
    <div ref={rootRef} className="relative flex justify-end">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('menuLabel', { name: organization.name })}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-lg text-mute',
          'transition-[background-color,color] duration-150',
          'hover:bg-dash-surface hover:text-ink',
          open && 'bg-dash-surface text-ink'
        )}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>

      {open ? (
        <ul
          id={menuId}
          role="menu"
          className={cn(
            'absolute top-[calc(100%+0.35rem)] right-0 z-20 min-w-[10.5rem] overflow-hidden rounded-xl border border-dash-border bg-canvas py-1',
            'shadow-[0_12px_32px_rgb(15_23_42/0.1),0_2px_6px_rgb(15_23_42/0.04)]'
          )}
        >
          {actions
            .filter((action) => !action.hidden)
            .map((action) => (
              <li key={action.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium',
                    action.tone === 'danger'
                      ? 'text-negative hover:bg-dash-danger-soft'
                      : 'text-ink hover:bg-dash-surface'
                  )}
                  onClick={() => {
                    setOpen(false)
                    onAction(action.id, organization)
                  }}
                >
                  <span className="text-mute [&_svg]:size-3.5">{action.icon}</span>
                  {action.label}
                </button>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  )
}

const STATUS_STYLES: Record<OrganizationStatus, string> = {
  active: 'bg-primary-pale text-positive-deep ring-1 ring-primary/30',
  trial: 'bg-dash-info-soft text-dash-info ring-1 ring-accent-cyan/35',
  suspended: 'bg-dash-warn-soft text-warning-content ring-1 ring-warning/35',
}

export function OrganizationStatusBadge({
  status,
  label,
}: {
  status: OrganizationStatus
  label: string
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold',
        STATUS_STYLES[status]
      )}
    >
      {label}
    </span>
  )
}

export function OrganizationPlanBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-lg bg-dash-surface px-2 py-0.5 text-[11px] font-semibold text-ink ring-1 ring-dash-border">
      {label}
    </span>
  )
}
