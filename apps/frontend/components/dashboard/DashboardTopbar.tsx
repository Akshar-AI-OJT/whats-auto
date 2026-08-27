'use client'

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Building2, Menu, Plus, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useOrganizations } from './OrganizationsProvider'
import { ORG_SETUP_PATH } from '@/lib/onboarding'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { DashboardSidebar } from './DashboardSidebar'
import { NotificationBell } from './NotificationBell'
import { UserProfileMenu } from './UserProfileMenu'
import {
  OrganizationSwitcher,
  organizationInitials,
  type OrganizationSwitcherItem,
} from './OrganizationSwitcher'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

type DashboardTopbarProps = {
  className?: string
}

const ACCENTS: OrganizationSwitcherItem['accent'][] = ['green', 'cyan', 'amber']

function detectMac() {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
}

function subscribeNoop() {
  return () => {}
}

function subscribeLg(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  const media = window.matchMedia('(min-width: 1024px)')
  media.addEventListener('change', onStoreChange)
  return () => media.removeEventListener('change', onStoreChange)
}

function getIsLg() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(min-width: 1024px)').matches
}

function formatRoleLabel(role: string): string {
  if (!role) return ''
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export function DashboardTopbar({ className }: DashboardTopbarProps) {
  const t = useTranslations('dashboard')
  const { user, signOut } = useAuth()
  const router = useRouter()
  const {
    organizations,
    activeOrganizationId,
    hasOrganizations,
    isLoading: orgsLoading,
    error: organizationsError,
    selectOrganization,
  } = useOrganizations()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [organizationOpen, setOrganizationOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchId = useId()
  const [searchFocused, setSearchFocused] = useState(false)
  const isMac = useSyncExternalStore(subscribeNoop, detectMac, () => false)
  const isLg = useSyncExternalStore(subscribeLg, getIsLg, () => false)

  const switcherOrganizations = useMemo<OrganizationSwitcherItem[]>(
    () =>
      organizations.map((org, index) => ({
        id: org.id,
        name: org.name,
        plan: formatRoleLabel(org.role),
        initials: organizationInitials(org.name),
        accent: ACCENTS[index % ACCENTS.length],
      })),
    [organizations]
  )

  const email = user?.email ?? ''
  const emailHandle = email.split('@')[0]?.trim() ?? ''
  const displayName =
    user?.name?.trim() ||
    [user?.firstname, user?.lastname].filter(Boolean).join(' ').trim() ||
    emailHandle ||
    t('topbar.guestName')
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
    router.replace('/login')
  }

  function goToOrgOnboarding() {
    setOrganizationOpen(false)
    router.push(ORG_SETUP_PATH)
  }

  async function handleOrganizationChange(nextId: string) {
    if (nextId === activeOrganizationId) return
    await selectOrganization(nextId)
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-dash-border/90 bg-canvas/90 px-3 py-2 backdrop-blur-md',
        'sm:min-h-16 sm:flex-nowrap sm:gap-x-3 sm:px-5 sm:py-2.5',
        'md:gap-x-3',
        'lg:h-[68px] lg:gap-x-3.5 lg:py-0',
        'dash-soft-shadow shadow-[0_1px_0_rgb(15_23_42/0.06)]',
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
          className="w-[min(320px,85vw)] border-dash-border bg-canvas p-0 sm:max-w-[320px]"
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

      {!orgsLoading && !hasOrganizations ? (
        <button
          type="button"
          onClick={goToOrgOnboarding}
          className={cn(
            'inline-flex max-w-[14rem] items-center gap-2 rounded-xl border border-dashed border-primary/45 bg-primary-pale/50 px-2.5 py-1.5 text-left sm:max-w-[18rem]',
            'transition-[background-color,border-color] duration-200 hover:border-primary/70 hover:bg-primary-pale'
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-primary/50 bg-canvas text-positive-deep">
            <Building2 className="size-3.5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-positive-deep">
              {t('workspace.emptyTitle')}
            </span>
            <span className="hidden truncate text-[11px] text-mute sm:block">
              {t('workspace.emptyAction')}
            </span>
          </span>
          <Plus className="size-4 shrink-0 text-positive-deep" aria-hidden />
        </button>
      ) : null}

      {hasOrganizations && activeOrganizationId ? (
        <OrganizationSwitcher
          className="order-1 min-w-0 max-w-[11rem] sm:max-w-[13rem] lg:max-w-[15rem]"
          organizations={switcherOrganizations}
          value={activeOrganizationId}
          open={organizationOpen}
          onOpenChange={(next) => {
            setOrganizationOpen(next)
            if (next) {
              setProfileOpen(false)
              setNotificationsOpen(false)
            }
          }}
          onChange={handleOrganizationChange}
          error={organizationsError}
          labels={{
            listLabel: t('workspace.listLabel'),
            active: t('workspace.active'),
            members: t('workspace.members'),
            create: t('workspace.create'),
          }}
          onCreateOrganization={goToOrgOnboarding}
        />
      ) : null}

      {/* Global search — own row until lg, then flexes in the header */}
      <div
        className={cn(
          'group/search relative order-last min-w-0 basis-full',
          'sm:order-2 sm:mx-1 sm:flex-1 sm:basis-auto sm:min-w-[13rem]',
          'lg:mx-2 lg:max-w-[42rem]'
        )}
      >
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
          value=""
          readOnly
          placeholder={
            isLg ? t('topbar.searchUnavailablePlaceholder') : t('topbar.searchPlaceholderShort')
          }
          autoComplete="off"
          aria-describedby={`${searchId}-hint ${searchId}-status`}
          title={t('topbar.searchUnavailableHint')}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className={cn(
            'h-9 w-full min-w-0 rounded-xl border border-dash-border bg-dash-surface/90 py-1.5 pl-9 text-sm text-ink outline-none',
            'pr-3 lg:pr-[4.5rem]',
            'placeholder:truncate placeholder:text-mute',
            'transition-[border-color,box-shadow,background-color] duration-200',
            'hover:border-dash-border-strong',
            'focus-visible:border-primary/55 focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-primary/30',
            'cursor-not-allowed opacity-90'
          )}
        />
        <p id={`${searchId}-status`} className="sr-only">
          {t('topbar.searchUnavailableHint')}
        </p>
        <kbd
          id={`${searchId}-hint`}
          className={cn(
            'pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 items-center gap-0.5 lg:inline-flex',
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

      <div className="order-3 ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
        <ThemeToggle />

        <NotificationBell
          open={notificationsOpen}
          onOpenChange={(next) => {
            setNotificationsOpen(next)
            if (next) {
              setOrganizationOpen(false)
              setProfileOpen(false)
            }
          }}
        />

        <div className="pl-1 sm:pl-1.5">
          <UserProfileMenu
            open={profileOpen}
            onOpenChange={(next) => {
              setProfileOpen(next)
              if (next) {
                setOrganizationOpen(false)
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
            onSelectItem={(id) => {
              if (id === 'profile') {
                router.push('/dashboard/profile')
              }
              if (id === 'workspace' || id === 'settings') {
                router.push('/dashboard/settings')
              }
              if (id === 'billing') {
                router.push('/dashboard/billing')
              }
            }}
          />
        </div>
      </div>
    </header>
  )
}
