'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { UserPlus, Users } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import { InviteMemberSheet } from '@/components/dashboard/team/InviteMemberSheet'

export function TeamMembersPage() {
  const t = useTranslations('dashboard.team')
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const inviteFromQuery = searchParams.get('invite') === '1'
  const [inviteForced, setInviteForced] = useState(false)
  const inviteOpen = inviteFromQuery || inviteForced

  function handleInviteOpenChange(open: boolean) {
    if (open) {
      setInviteForced(true)
      return
    }
    setInviteForced(false)
    if (inviteFromQuery) {
      router.replace(pathname)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6">
      <DashboardPanel
        as="section"
        className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
      >
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-wide text-positive-deep uppercase">
              {t('eyebrow')}
            </p>
            <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-body sm:text-base sm:leading-7">
              {t('subtitle')}
            </p>
          </div>
          <Button
            type="button"
            className="shrink-0 gap-2"
            onClick={() => setInviteForced(true)}
          >
            <UserPlus className="size-4" aria-hidden />
            {t('inviteCta')}
          </Button>
        </div>
      </DashboardPanel>

      <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
        <DashboardSectionHeader
          title={t('membersTitle')}
          description={t('membersDescription')}
        />
        <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dash-border bg-dash-surface/50 px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
            <Users className="size-5" aria-hidden />
          </span>
          <p className="font-medium text-ink">{t('emptyTitle')}</p>
          <p className="max-w-sm text-sm text-body">{t('emptyDescription')}</p>
        </div>
      </DashboardPanel>

      <InviteMemberSheet open={inviteOpen} onOpenChange={handleInviteOpenChange} />
    </div>
  )
}
