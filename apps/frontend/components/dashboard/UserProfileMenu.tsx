'use client'

import { useEffect, useId, useRef } from 'react'
import {
  Building2,
  ChevronDown,
  CreditCard,
  LogOut,
  Settings,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type UserProfileMenuItemId =
  | 'profile'
  | 'workspace'
  | 'billing'
  | 'settings'
  | 'signOut'

export type UserProfileMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  displayName: string
  email?: string
  initials: string
  labels: {
    myProfile: string
    workspace: string
    billing: string
    settings: string
    signOut: string
    openMenu: string
  }
  onSignOut: () => void | Promise<void>
  /** Optional UI-only handlers for non-auth items. */
  onSelectItem?: (id: Exclude<UserProfileMenuItemId, 'signOut'>) => void
  className?: string
}

type MenuAction = {
  id: UserProfileMenuItemId
  label: string
  icon: LucideIcon
  tone?: 'default' | 'danger'
}

export function UserProfileMenu({
  open,
  onOpenChange,
  displayName,
  email,
  initials,
  labels,
  onSignOut,
  onSelectItem,
  className,
}: UserProfileMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const actions: MenuAction[] = [
    { id: 'profile', label: labels.myProfile, icon: UserRound },
    { id: 'workspace', label: labels.workspace, icon: Building2 },
    { id: 'billing', label: labels.billing, icon: CreditCard },
    { id: 'settings', label: labels.settings, icon: Settings },
    { id: 'signOut', label: labels.signOut, icon: LogOut, tone: 'danger' },
  ]

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onOpenChange(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChange(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  async function handleSelect(id: UserProfileMenuItemId) {
    if (id === 'signOut') {
      onOpenChange(false)
      await onSignOut()
      return
    }

    onOpenChange(false)
    onSelectItem?.(id)
  }

  return (
    <div ref={rootRef} className={cn('relative shrink-0', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={labels.openMenu}
        onClick={() => onOpenChange(!open)}
        className={cn(
          'inline-flex items-center gap-2 rounded-xl border border-dash-border bg-canvas py-1.5 pr-2 pl-1.5',
          'transition-[background-color,border-color,box-shadow] duration-200',
          'hover:border-dash-border-strong hover:bg-dash-surface',
          open && 'border-primary/45 shadow-[0_0_0_3px_rgb(159_232_112/0.14)]'
        )}
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-on-primary">
          {initials}
        </span>
        <span className="hidden min-w-0 max-w-[7rem] truncate text-sm font-semibold text-ink sm:block">
          {displayName}
        </span>
        <ChevronDown
          className={cn(
            'hidden size-4 text-mute transition-transform duration-200 sm:block',
            open && 'rotate-180'
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            'absolute top-[calc(100%+0.45rem)] right-0 z-50 w-[min(17rem,calc(100vw-1.25rem))] overflow-hidden rounded-2xl border border-dash-border bg-canvas',
            'dash-elevated-shadow'
          )}
        >
          <div className="border-b border-dash-border px-3.5 py-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-on-primary shadow-[0_4px_12px_rgb(159_232_112/0.3)]">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
                {email ? (
                  <p className="mt-0.5 truncate text-xs text-mute">{email}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="p-1.5">
            {actions.slice(0, 4).map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-medium text-ink',
                    'transition-colors duration-150 hover:bg-dash-surface'
                  )}
                  onClick={() => void handleSelect(action.id)}
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-dash-surface text-mute">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  {action.label}
                </button>
              )
            })}
          </div>

          <div className="border-t border-dash-border p-1.5">
            {actions.slice(4).map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-medium',
                    'transition-colors duration-150',
                    action.tone === 'danger'
                      ? 'text-negative hover:bg-dash-danger-soft'
                      : 'text-ink hover:bg-dash-surface'
                  )}
                  onClick={() => void handleSelect(action.id)}
                >
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-lg',
                      action.tone === 'danger' ? 'bg-dash-danger-soft' : 'bg-dash-surface text-mute'
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  {action.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
