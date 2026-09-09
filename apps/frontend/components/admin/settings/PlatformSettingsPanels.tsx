'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import {
  api,
  type PlatformSettingItem,
  type PlatformSettingState,
  type PlatformSettingsSnapshot,
} from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'

const STATE_STYLES: Record<PlatformSettingState, string> = {
  enabled: 'bg-primary-pale text-positive-deep ring-1 ring-primary/30',
  disabled: 'bg-dash-surface text-mute ring-1 ring-dash-border',
  scheduled: 'bg-dash-info-soft text-dash-info ring-1 ring-accent-cyan/35',
}

const SECTION_KEYS = [
  'branding',
  'authentication',
  'smtp',
  'oauth',
  'maintenanceMode',
  'configuration',
] as const

type SectionKey = (typeof SECTION_KEYS)[number]

const SECTION_I18N: Record<SectionKey, string> = {
  branding: 'platformBranding',
  authentication: 'authentication',
  smtp: 'smtp',
  oauth: 'oauth',
  maintenanceMode: 'maintenanceMode',
  configuration: 'platformConfiguration',
}

function unwrapSnapshot(payload: unknown): PlatformSettingsSnapshot | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as { data?: PlatformSettingsSnapshot } & Partial<PlatformSettingsSnapshot>
  const source = root.data && typeof root.data === 'object' ? root.data : root
  if (!source || typeof source !== 'object') return null
  if (!Array.isArray(source.branding) || !Array.isArray(source.oauth)) return null
  return {
    branding: source.branding ?? [],
    authentication: source.authentication ?? [],
    smtp: source.smtp ?? [],
    oauth: source.oauth ?? [],
    maintenanceMode: source.maintenanceMode ?? [],
    configuration: source.configuration ?? [],
  }
}

type SettingsSectionProps = {
  title: string
  description: string
  items: PlatformSettingItem[]
  emptyLabel: string
  labelFor: (key: string) => string
  stateLabelFor: (state: PlatformSettingState) => string
}

function SettingsSection({
  title,
  description,
  items,
  emptyLabel,
  labelFor,
  stateLabelFor,
}: SettingsSectionProps) {
  return (
    <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={title} description={description} />
      {items.length === 0 ? (
        <p className="mt-5 text-sm text-mute">{emptyLabel}</p>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl border border-dash-border">
          {items.map((item, index) => (
            <div
              key={item.id}
              className={cn(
                'flex flex-col gap-3 px-4 py-3.5 sm:px-5',
                index % 2 === 1 ? 'bg-dash-surface/60' : 'bg-transparent',
                'border-b border-dash-border last:border-b-0 md:flex-row md:items-center md:justify-between'
              )}
            >
              <div className="min-w-0 md:max-w-[70%]">
                <p className="text-sm font-semibold text-ink">{labelFor(item.key)}</p>
                <p className="mt-1 break-all text-sm text-body">{item.value}</p>
              </div>
              <span
                className={cn(
                  'inline-flex w-fit rounded-lg px-2 py-0.5 text-[11px] font-semibold',
                  STATE_STYLES[item.state] ?? STATE_STYLES.disabled
                )}
              >
                {stateLabelFor(item.state)}
              </span>
            </div>
          ))}
        </div>
      )}
    </DashboardPanel>
  )
}

export function PlatformSettingsPanels() {
  const t = useTranslations('admin.settings')

  const settingsQuery = useQuery({
    queryKey: queryKeys.admin.platformSettings,
    queryFn: async () => {
      const { data } = await api.superAdmin.platformSettings.get()
      const snapshot = unwrapSnapshot(data)
      if (!snapshot) throw new Error('invalid_platform_settings')
      return snapshot
    },
  })

  if (settingsQuery.isLoading) {
    return (
      <DashboardPanel className="flex items-center gap-3 p-5 text-sm text-body">
        <Loader2 className="size-4 animate-spin text-positive-deep" aria-hidden />
        {t('loading')}
      </DashboardPanel>
    )
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <DashboardPanel className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">{t('errors.loadFailed')}</p>
          <p className="mt-1 text-sm text-body">{t('errors.loadFailedHint')}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void settingsQuery.refetch()}>
          {t('retry')}
        </Button>
      </DashboardPanel>
    )
  }

  const snapshot = settingsQuery.data

  return (
    <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-2 xl:gap-6">
      {SECTION_KEYS.map((sectionKey) => (
        <div key={sectionKey} className="min-w-0">
          <SettingsSection
            title={t(`sections.${SECTION_I18N[sectionKey]}.title`)}
            description={t(`sections.${SECTION_I18N[sectionKey]}.description`)}
            items={snapshot[sectionKey]}
            emptyLabel={t('emptySection')}
            labelFor={(key) => t(`fields.${key}`)}
            stateLabelFor={(state) => t(`states.${state}`)}
          />
        </div>
      ))}
    </div>
  )
}
