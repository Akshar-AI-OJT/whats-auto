import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { DashboardSectionHeader } from '@/components/dashboard/ui/DashboardSectionHeader'
import {
  MOCK_PLATFORM_SETTINGS,
  type MockPlatformSettingItem,
  type PlatformSettingState,
} from '../mock-data'

const STATE_STYLES: Record<PlatformSettingState, string> = {
  enabled: 'bg-primary-pale text-positive-deep ring-1 ring-primary/30',
  disabled: 'bg-dash-surface text-mute ring-1 ring-dash-border',
  scheduled: 'bg-dash-info-soft text-dash-info ring-1 ring-accent-cyan/35',
}

type SettingsSectionProps = {
  title: string
  description: string
  items: MockPlatformSettingItem[]
  labelFor: (key: string) => string
  stateLabelFor: (state: PlatformSettingState) => string
}

function SettingsSection({
  title,
  description,
  items,
  labelFor,
  stateLabelFor,
}: SettingsSectionProps) {
  return (
    <DashboardPanel as="section" className="p-4 sm:p-5 md:p-6">
      <DashboardSectionHeader title={title} description={description} />
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
                STATE_STYLES[item.state]
              )}
            >
              {stateLabelFor(item.state)}
            </span>
          </div>
        ))}
      </div>
    </DashboardPanel>
  )
}

export async function PlatformSettingsPage() {
  const t = await getTranslations('admin.settings')

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 sm:gap-6">
      <DashboardPanel
        as="section"
        className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-primary-pale/80 blur-[70px]"
        />
        <div className="relative">
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
      </DashboardPanel>

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-2 xl:gap-6">
        <div className="min-w-0">
          <SettingsSection
            title={t('sections.platformBranding.title')}
            description={t('sections.platformBranding.description')}
            items={MOCK_PLATFORM_SETTINGS.branding}
            labelFor={(key) => t(`fields.${key}`)}
            stateLabelFor={(state) => t(`states.${state}`)}
          />
        </div>
        <div className="min-w-0">
          <SettingsSection
            title={t('sections.authentication.title')}
            description={t('sections.authentication.description')}
            items={MOCK_PLATFORM_SETTINGS.authentication}
            labelFor={(key) => t(`fields.${key}`)}
            stateLabelFor={(state) => t(`states.${state}`)}
          />
        </div>
        <div className="min-w-0">
          <SettingsSection
            title={t('sections.smtp.title')}
            description={t('sections.smtp.description')}
            items={MOCK_PLATFORM_SETTINGS.smtp}
            labelFor={(key) => t(`fields.${key}`)}
            stateLabelFor={(state) => t(`states.${state}`)}
          />
        </div>
        <div className="min-w-0">
          <SettingsSection
            title={t('sections.oauth.title')}
            description={t('sections.oauth.description')}
            items={MOCK_PLATFORM_SETTINGS.oauth}
            labelFor={(key) => t(`fields.${key}`)}
            stateLabelFor={(state) => t(`states.${state}`)}
          />
        </div>
        <div className="min-w-0">
          <SettingsSection
            title={t('sections.maintenanceMode.title')}
            description={t('sections.maintenanceMode.description')}
            items={MOCK_PLATFORM_SETTINGS.maintenanceMode}
            labelFor={(key) => t(`fields.${key}`)}
            stateLabelFor={(state) => t(`states.${state}`)}
          />
        </div>
        <div className="min-w-0">
          <SettingsSection
            title={t('sections.platformConfiguration.title')}
            description={t('sections.platformConfiguration.description')}
            items={MOCK_PLATFORM_SETTINGS.configuration}
            labelFor={(key) => t(`fields.${key}`)}
            stateLabelFor={(state) => t(`states.${state}`)}
          />
        </div>
      </div>
    </div>
  )
}
