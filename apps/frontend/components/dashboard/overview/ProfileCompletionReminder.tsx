'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { ArrowRight } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { api, type MediaAsset } from '@/lib/api'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import {
  calculateOrganizationProfileCompletion,
  ORG_PROFILE_PATH,
  organizationToProfileFormValues,
} from '@/lib/organization-profile'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { cn } from '@/lib/utils'

function unwrapLogo(data: unknown): MediaAsset | null {
  if (!data || typeof data !== 'object') return null
  const root = data as { data?: MediaAsset | null } & Partial<MediaAsset>
  if (root.data === null) return null
  const asset = root.data ?? (root.id ? (root as MediaAsset) : null)
  return asset?.id && asset.state === 'ready' ? asset : null
}

/** Non-blocking reminder for the OWNER when optional profile fields remain. */
export function ProfileCompletionReminder() {
  const t = useTranslations('dashboard.home.profileReminder')
  const { activeOrganization, isOwner, isLoading, tenantOrganizationId } = useOrganizations()

  const logoQuery = useQuery({
    queryKey: ['organization-logo', tenantOrganizationId],
    enabled: Boolean(isOwner && tenantOrganizationId && activeOrganization),
    queryFn: async () => {
      const { data } = await api.media.organizationLogo()
      return unwrapLogo(data)
    },
    staleTime: 60_000,
  })

  const completion = useMemo(() => {
    if (!activeOrganization) return null
    return calculateOrganizationProfileCompletion(
      organizationToProfileFormValues(activeOrganization, {
        hasLogo: Boolean(logoQuery.data?.id),
      })
    )
  }, [activeOrganization, logoQuery.data?.id])

  if (isLoading || !completion || !isOwner) return null
  if (!completion.requiredComplete) return null
  if (completion.percent >= 100) return null

  return (
    <DashboardPanel
      as="section"
      className="relative overflow-hidden px-4 py-4 sm:px-5 sm:py-5"
      aria-labelledby="profile-completion-reminder-title"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p
            id="profile-completion-reminder-title"
            className="text-sm font-semibold text-ink"
          >
            {t('title', { percent: completion.percent })}
          </p>
          <p className="mt-1 text-sm text-body">{t('subtitle')}</p>
          <div className="mt-3 h-1.5 max-w-xs overflow-hidden rounded-full bg-dash-border">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
        </div>
        <Link
          href={ORG_PROFILE_PATH}
          className={cn(
            'inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold',
            'bg-primary text-on-primary hover:bg-primary-active'
          )}
        >
          {t('cta')}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </DashboardPanel>
  )
}
