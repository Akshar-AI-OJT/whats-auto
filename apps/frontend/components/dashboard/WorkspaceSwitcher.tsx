'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type WorkspaceSwitcherItem = {
  id: string
  name: string
  plan?: string
  initials: string
  accent?: 'green' | 'cyan' | 'amber'
  members?: number
}

export type WorkspaceSwitcherProps = {
  workspaces: WorkspaceSwitcherItem[]
  value?: string
  defaultValue?: string
  /** May be async — switcher stays open and disables items until it resolves. */
  onChange?: (workspaceId: string) => void | Promise<void>
  onOpenChange?: (open: boolean) => void
  /** Close when parent requests (e.g. another menu opens). */
  open?: boolean
  /** Shown under the list when a switch fails; keeps the menu open. */
  error?: string | null
  labels?: {
    listLabel?: string
    active?: string
    members?: string
    create?: string
  }
  className?: string
  /** Create-workspace action — shown below the org list when provided. */
  onCreateWorkspace?: () => void
}

const ACCENT_STYLES = {
  green: 'bg-primary text-on-primary',
  cyan: 'bg-accent-cyan text-ink',
  amber: 'bg-warning text-warning-content',
} as const

export function WorkspaceAvatar({
  initials,
  accent = 'green',
  size = 'md',
  className,
}: {
  initials: string
  accent?: WorkspaceSwitcherItem['accent']
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-bold',
        size === 'sm' && 'size-7 text-[10px]',
        size === 'md' && 'size-8 text-xs',
        size === 'lg' && 'size-9 text-sm',
        ACCENT_STYLES[accent ?? 'green'],
        'shadow-[0_4px_12px_rgb(15_23_42/0.08)]',
        className
      )}
      aria-hidden
    >
      {initials}
    </span>
  )
}

export function WorkspaceSwitcher({
  workspaces,
  value,
  defaultValue,
  onChange,
  onOpenChange,
  open: openProp,
  error = null,
  labels,
  className,
  onCreateWorkspace,
}: WorkspaceSwitcherProps) {
  const isControlled = value !== undefined
  const [internalId, setInternalId] = useState(
    defaultValue ?? workspaces[0]?.id ?? ''
  )
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const open = openProp ?? uncontrolledOpen
  const workspaceId = isControlled ? (value ?? '') : internalId
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const errorId = useId()
  const isSwitching = Boolean(pendingId)

  const active =
    workspaces.find((w) => w.id === workspaceId) ?? workspaces[0] ?? null

  const listLabel = labels?.listLabel ?? 'Workspaces'
  const activeLabel = labels?.active ?? 'Active'
  const membersLabel = labels?.members ?? 'members'
  const createLabel = labels?.create ?? 'Create workspace'

  function setOpen(next: boolean) {
    if (isSwitching) return
    if (openProp === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  function closeMenu() {
    if (openProp === undefined) setUncontrolledOpen(false)
    onOpenChange?.(false)
  }

  async function selectWorkspace(id: string) {
    if (id === workspaceId || isSwitching) return

    setPendingId(id)
    try {
      await onChange?.(id)
      if (!isControlled) setInternalId(id)
      closeMenu()
    } catch {
      // Parent surfaces error via `error` prop; keep menu open.
    } finally {
      setPendingId(null)
    }
  }

  useEffect(() => {
    if (!open) return

    function close() {
      if (pendingId) return
      if (openProp === undefined) setUncontrolledOpen(false)
      onOpenChange?.(false)
    }

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close()
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, openProp, onOpenChange, pendingId])

  if (!active) return null

  return (
    <div ref={rootRef} className={cn('relative shrink-0', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-busy={isSwitching || undefined}
        disabled={isSwitching}
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex max-w-[9.5rem] items-center gap-2 rounded-xl border border-dash-border bg-canvas px-2 py-1.5 text-left sm:max-w-[16rem] sm:px-2.5',
          'transition-[background-color,border-color,box-shadow] duration-200',
          'hover:border-dash-border-strong hover:bg-dash-surface',
          open && 'border-primary/45 shadow-[0_0_0_3px_rgb(159_232_112/0.14)]',
          isSwitching && 'cursor-wait opacity-80'
        )}
      >
        <WorkspaceAvatar
          initials={active.initials}
          accent={active.accent}
          size="sm"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">
            {active.name}
          </span>
          {active.plan ? (
            <span className="hidden truncate text-[11px] text-mute sm:block">
              {active.plan}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-mute transition-transform duration-200',
            open && 'rotate-180'
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          className={cn(
            'absolute top-[calc(100%+0.45rem)] left-0 z-50 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-dash-border bg-canvas',
            'dash-elevated-shadow'
          )}
        >
          <div className="border-b border-dash-border px-3.5 py-2.5">
            <p className="text-[11px] font-semibold tracking-wide text-mute uppercase">
              {listLabel}
            </p>
          </div>

          <ul
            id={listId}
            role="listbox"
            className="max-h-72 overflow-y-auto p-1.5"
            aria-describedby={error ? errorId : undefined}
          >
            {workspaces.map((ws) => {
              const selected = ws.id === active.id
              const rowPending = pendingId === ws.id
              return (
                <li key={ws.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    disabled={isSwitching}
                    aria-busy={rowPending || undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left',
                      'transition-[background-color,box-shadow] duration-150',
                      selected
                        ? 'bg-primary-pale shadow-[0_0_0_1px_rgb(159_232_112/0.35)]'
                        : 'hover:bg-dash-surface',
                      isSwitching && 'cursor-wait opacity-70'
                    )}
                    onClick={() => void selectWorkspace(ws.id)}
                  >
                    <WorkspaceAvatar
                      initials={ws.initials}
                      accent={ws.accent}
                      size="md"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            'truncate text-sm font-semibold',
                            selected ? 'text-positive-deep' : 'text-ink'
                          )}
                        >
                          {ws.name}
                        </span>
                        {selected ? (
                          <span className="inline-flex shrink-0 items-center rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-on-primary">
                            {activeLabel}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-mute">
                        {ws.plan ? <span>{ws.plan}</span> : null}
                        {ws.plan && typeof ws.members === 'number' ? (
                          <span aria-hidden>·</span>
                        ) : null}
                        {typeof ws.members === 'number' ? (
                          <span>
                            {ws.members} {membersLabel}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    {selected ? (
                      <Check
                        className="size-4 shrink-0 text-positive-deep"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>

          {error ? (
            <p
              id={errorId}
              role="alert"
              className="border-t border-dash-border px-3.5 py-2 text-xs text-negative"
            >
              {error}
            </p>
          ) : null}

          {onCreateWorkspace ? (
            <div className="border-t border-dash-border p-1.5">
              <button
                type="button"
                disabled={isSwitching}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-sm font-semibold text-positive-deep',
                  'transition-colors duration-150 hover:bg-primary-pale',
                  isSwitching && 'cursor-wait opacity-70'
                )}
                onClick={() => {
                  setOpen(false)
                  onCreateWorkspace()
                }}
              >
                <span className="flex size-8 items-center justify-center rounded-lg border border-dashed border-primary/50 bg-primary-pale/60">
                  <Plus className="size-3.5" aria-hidden />
                </span>
                {createLabel}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Map organization name → 1–2 letter avatar initials. */
export function organizationInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'OR'
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}
