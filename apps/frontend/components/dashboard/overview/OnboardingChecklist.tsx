'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Megaphone, MessageCircle, UserPlus, X } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { api } from '@/lib/api'
import {
  dismissOnboardingChecklist,
  isOnboardingChecklistVisible,
  TEAM_MEMBERS_PATH,
} from '@/lib/onboarding'
import { cn } from '@/lib/utils'
import { useOrganizations } from '../OrganizationsProvider'
import { DashboardPanel } from '../ui/DashboardPanel'

const NEXT_STEPS = [
  {
    id: 'whatsapp',
    href: '/dashboard/whatsapp',
    icon: MessageCircle,
  },
  {
    id: 'invite',
    href: TEAM_MEMBERS_PATH,
    icon: UserPlus,
  },
  {
    id: 'campaign',
    href: '/dashboard',
    icon: Megaphone,
  },
] as const

const CHECKLIST_EVENT = 'wa-onboarding-checklist-change'

function unwrapList<T>(data: { data?: T[] } | T[] | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.data)) return data.data
  return []
}

function subscribeChecklist(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(CHECKLIST_EVENT, onStoreChange)
  window.addEventListener('storage', onStoreChange)
  return () => {
    window.removeEventListener(CHECKLIST_EVENT, onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}

function getChecklistSnapshot() {
  return isOnboardingChecklistVisible()
}

function getChecklistServerSnapshot() {
  return false
}

export function OnboardingChecklist({ className }: { className?: string }) {
  const t = useTranslations('dashboard.home.checklist')
  const {
    activeOrganization,
    tenantOrganizationId,
    hasOrganizations,
    canInviteMembers,
    isLoading: orgsLoading,
  } = useOrganizations()
  const dismissed = !useSyncExternalStore(
    subscribeChecklist,
    getChecklistSnapshot,
    getChecklistServerSnapshot
  )
  const [whatsappConnected, setWhatsappConnected] = useState(false)

  useEffect(() => {
    if (orgsLoading || !tenantOrganizationId) {
      setWhatsappConnected(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.whatsapp.listConfigs()
        if (cancelled) return
        const configs = unwrapList(data)
        setWhatsappConnected(configs.some((c) => c.status === 'connected'))
      } catch {
        if (!cancelled) setWhatsappConnected(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [tenantOrganizationId, orgsLoading])

  // Same source of truth as the workspace switcher: never claim a workspace
  // exists unless the organizations API reports one.
  if (dismissed || !hasOrganizations) return null

  const nextSteps = NEXT_STEPS.filter((step) => {
    if (step.id === 'invite' && !canInviteMembers) return false
    if (step.id === 'whatsapp' && whatsappConnected) return false
    return true
  })

  return (
    <DashboardPanel
      as="section"
      className={cn('relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6', className)}
      aria-labelledby="onboarding-checklist-title"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 right-0 size-36 rounded-full bg-primary-pale/70 blur-[60px]"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-positive-deep uppercase">
            {t('eyebrow')}
          </p>
          <h2
            id="onboarding-checklist-title"
            className="mt-1 font-display text-xl tracking-tight text-ink sm:text-2xl"
          >
            {t('title')}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => dismissOnboardingChecklist()}
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-dash-border text-mute',
            'transition-colors hover:bg-dash-surface hover:text-ink'
          )}
          aria-label={t('dismiss')}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <ul className="relative mt-4 flex flex-col gap-2.5">
        <li className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary-pale/50 px-3.5 py-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
            <Check className="size-3.5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-positive-deep">
              {t('completed.workspace')}
            </span>
            {activeOrganization ? (
              <span className="mt-0.5 block truncate text-xs text-mute">
                {activeOrganization.name}
              </span>
            ) : null}
          </span>
        </li>
        {whatsappConnected ? (
          <li className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary-pale/50 px-3.5 py-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
              <Check className="size-3.5" aria-hidden />
            </span>
            <span className="block text-sm font-semibold text-positive-deep">
              {t('completed.whatsapp')}
            </span>
          </li>
        ) : null}
      </ul>

      {nextSteps.length > 0 ? (
        <div className="relative mt-5">
          <p className="text-sm font-semibold text-ink">{t('nextStepsTitle')}</p>
          <ul className="mt-2.5 flex flex-col gap-2">
            {nextSteps.map((step) => {
              const Icon = step.icon
              return (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border border-dash-border bg-canvas px-3.5 py-3',
                      'transition-[border-color,background-color] duration-150 hover:border-dash-border-strong hover:bg-dash-surface'
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-dash-surface text-positive-deep">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="text-sm font-medium text-ink">
                      {t(`nextSteps.${step.id}`)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </DashboardPanel>
  )
}
