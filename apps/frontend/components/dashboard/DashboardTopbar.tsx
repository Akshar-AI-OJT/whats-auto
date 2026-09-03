'use client'

import { useMemo, useState } from 'react'
import { Building2, Menu, Plus } from 'lucide-react'
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
import { GlobalSearch } from '@/components/search/GlobalSearch'

type DashboardTopbarProps = {
  className?: string
}

const ACCENTS: OrganizationSwitcherItem['accent'][] = ['green', 'cyan', 'amber']

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
              {t('organizationSwitcher.emptyTitle')}
            </span>
            <span className="hidden truncate text-[11px] text-mute sm:block">
              {t('organizationSwitcher.emptyAction')}
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
            listLabel: t('organizationSwitcher.listLabel'),
            active: t('organizationSwitcher.active'),
            members: t('organizationSwitcher.members'),
            create: t('organizationSwitcher.create'),
          }}
          onCreateOrganization={goToOrgOnboarding}
        />
      ) : null}

      <GlobalSearch
        scope="organization"
        className={cn(
          'order-last min-w-0 basis-full',
          'sm:order-2 sm:mx-1 sm:flex-1 sm:basis-auto sm:min-w-[13rem]',
          'lg:mx-2 lg:max-w-[42rem]'
        )}
        onOpenChange={(open) => {
          if (open) {
            setOrganizationOpen(false)
            setNotificationsOpen(false)
            setProfileOpen(false)
          }
        }}
      />

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
              organization: t('topbar.organization'),
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
              if (id === 'organization' || id === 'settings') {
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
