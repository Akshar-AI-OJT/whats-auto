'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { Menu, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { DashboardSidebar } from './DashboardSidebar'
import { MOCK_NOTIFICATIONS, MOCK_WORKSPACES } from './mock-data'
import { NotificationBell } from './NotificationBell'
import { UserProfileMenu } from './UserProfileMenu'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

type DashboardTopbarProps = {
  className?: string
}

function detectMac() {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
}

function subscribeNoop() {
  return () => {}
}

export function DashboardTopbar({ className }: DashboardTopbarProps) {
  const t = useTranslations('dashboard')
  const { user, signOut } = useAuth()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [workspaceId, setWorkspaceId] = useState(MOCK_WORKSPACES[0].id)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchId = useId()
  const [searchFocused, setSearchFocused] = useState(false)
  const isMac = useSyncExternalStore(subscribeNoop, detectMac, () => false)

  const displayName =
    user?.name?.trim() ||
    [user?.firstname, user?.lastname].filter(Boolean).join(' ').trim() ||
    t('topbar.guestName')
  const email = user?.email ?? ''
  const initials =
    user?.initials?.trim() ||
    displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') ||
    'WA'

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isShortcut =
        (event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)
      if (!isShortcut) return

      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return
      }

      event.preventDefault()
      searchInputRef.current?.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  async function handleSignOut() {
    setProfileOpen(false)
    await signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2.5 border-b border-dash-border bg-canvas/90 px-3 py-2.5 backdrop-blur-md',
        'sm:gap-x-3 sm:px-5 sm:py-3',
        'lg:h-16 lg:flex-nowrap lg:gap-4 lg:py-0',
        'dash-soft-shadow',
        className
      )}
    >
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          className={cn(
            'inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-dash-border bg-canvas text-ink lg:hidden',
            'transition-[background-color,border-color] duration-200 hover:bg-dash-surface'
          )}
          aria-label={t('topbar.openMenu')}
        >
          <Menu className="size-5" aria-hidden />
        </SheetTrigger>
        <SheetContent
          side="left"
          showCloseButton
          className="w-[min(280px,85vw)] border-dash-border bg-canvas p-0 sm:max-w-[280px]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t('brand')}</SheetTitle>
          </SheetHeader>
          <DashboardSidebar
            className="h-full border-0"
            collapsed={false}
            showCollapseToggle={false}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <WorkspaceSwitcher
        className="min-w-0"
        workspaces={MOCK_WORKSPACES}
        value={workspaceId}
        open={workspaceOpen}
        onOpenChange={(next) => {
          setWorkspaceOpen(next)
          if (next) {
            setProfileOpen(false)
            setNotificationsOpen(false)
          }
        }}
        onChange={setWorkspaceId}
        labels={{
          listLabel: t('workspace.listLabel'),
          active: t('workspace.active'),
          members: t('workspace.members'),
          create: t('workspace.create'),
        }}
        onCreateWorkspace={() => {
          // UI-only for now — future create-workspace flow.
        }}
      />

      {/* Global search — full width on mobile, flexes on tablet+ */}
      <div className="group/search relative order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
        <label htmlFor={searchId} className="sr-only">
          {t('topbar.searchLabel')}
        </label>
        <Search
          className={cn(
            'pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute',
            'transition-[transform,color] duration-200 ease-out',
            'group-hover/search:scale-110 group-hover/search:text-positive-deep',
            'group-focus-within/search:scale-110 group-focus-within/search:rotate-12 group-focus-within/search:text-positive-deep',
            searchFocused && 'scale-110 rotate-12 text-positive-deep'
          )}
          aria-hidden
        />
        <input
          ref={searchInputRef}
          id={searchId}
          type="search"
          placeholder={t('topbar.searchPlaceholder')}
          autoComplete="off"
          readOnly
          aria-describedby={`${searchId}-hint`}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className={cn(
            'h-10 w-full rounded-xl border border-dash-border bg-dash-surface/90 py-2 pr-3 pl-9 text-sm text-ink outline-none sm:pr-[4.5rem]',
            'placeholder:text-mute',
            'transition-[border-color,box-shadow,background-color] duration-200',
            'hover:border-dash-border-strong',
            'focus-visible:border-primary/55 focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-primary/30',
            'cursor-text read-only:cursor-text'
          )}
        />
        <kbd
          id={`${searchId}-hint`}
          className={cn(
            'pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 items-center gap-0.5 sm:inline-flex',
            'rounded-md border border-dash-border bg-canvas px-1.5 py-0.5',
            'text-[10px] font-semibold tracking-wide text-mute',
            'shadow-[0_1px_0_rgb(15_23_42/0.04)]',
            'transition-[border-color,color,opacity] duration-200',
            searchFocused && 'border-primary/35 text-positive-deep'
          )}
          aria-label={t('topbar.searchShortcutLabel', {
            shortcut: isMac ? '⌘K' : 'Ctrl+K',
          })}
        >
          <span>{isMac ? '⌘' : 'Ctrl'}</span>
          <span className="opacity-60">+</span>
          <span>K</span>
        </kbd>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 lg:ml-0">
        <ThemeToggle />

        <NotificationBell
          notifications={MOCK_NOTIFICATIONS}
          open={notificationsOpen}
          onOpenChange={(next) => {
            setNotificationsOpen(next)
            if (next) {
              setWorkspaceOpen(false)
              setProfileOpen(false)
            }
          }}
        />

        <UserProfileMenu
          open={profileOpen}
          onOpenChange={(next) => {
            setProfileOpen(next)
            if (next) {
              setWorkspaceOpen(false)
              setNotificationsOpen(false)
            }
          }}
          displayName={displayName}
          email={email}
          initials={initials}
          labels={{
            myProfile: t('topbar.myProfile'),
            workspace: t('topbar.workspace'),
            billing: t('topbar.billing'),
            settings: t('topbar.settings'),
            signOut: t('signOut'),
            openMenu: t('topbar.profileMenu'),
          }}
          onSignOut={handleSignOut}
        />
      </div>
    </header>
  )
}
