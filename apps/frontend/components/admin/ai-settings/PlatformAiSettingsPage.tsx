import { getTranslations } from 'next-intl/server'
import { DashboardPanel } from '@/components/dashboard/ui/DashboardPanel'
import { PlatformAiConfigSection } from '@/components/admin/settings/PlatformAiConfigSection'

export async function PlatformAiSettingsPage() {
  const t = await getTranslations('admin.aiSettings')

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      <DashboardPanel as="section" className="px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h1 className="font-display text-[1.75rem] leading-tight tracking-tight text-ink sm:text-3xl">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-body sm:text-base sm:leading-7">
              {t('subtitle')}
            </p>
          </div>
        </div>
      </DashboardPanel>

      <PlatformAiConfigSection />
    </div>
  )
}
