'use client'

import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type OrganizationProfileStepId = 1 | 2 | 3 | 4

type SidebarItemStatus = 'done' | 'active' | 'upcoming'

const STEP_KEYS = [
  'organization',
  'business',
  'address',
  'review',
] as const

export function OrganizationProfileSidebar({
  currentStep,
  completionPercent,
}: {
  currentStep: OrganizationProfileStepId
  completionPercent: number | null
}) {
  const t = useTranslations('onboarding.organizationProfile')

  return (
    <aside className="rounded-2xl border border-[#E2E8F0] bg-canvas p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_8px_24px_rgb(15_23_42/0.04)] sm:p-6">
      <h1 className="font-display text-[1.25rem] leading-7 tracking-tight text-ink sm:text-[1.35rem] sm:leading-8">
        {t('sidebar.title')}
      </h1>
      <p className="mt-2 text-sm leading-6 text-pretty text-body">{t('sidebar.subtitle')}</p>

      <ol className="mt-7 flex flex-col gap-5">
        {STEP_KEYS.map((key, index) => {
          const id = (index + 1) as OrganizationProfileStepId
          const status: SidebarItemStatus =
            currentStep > id ? 'done' : currentStep === id ? 'active' : 'upcoming'

          return (
            <li key={key} className="flex gap-3">
              <span
                className={cn(
                  'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200',
                  status === 'done' && 'bg-primary text-on-primary',
                  status === 'active' && 'bg-primary text-on-primary ring-4 ring-primary/20',
                  status === 'upcoming' && 'border border-[#E2E8F0] bg-[#F8FAFC] text-mute'
                )}
                aria-current={status === 'active' ? 'step' : undefined}
              >
                {status === 'done' ? (
                  <Check className="size-3.5 stroke-[2.5]" aria-hidden />
                ) : (
                  id
                )}
              </span>
              <span className="min-w-0 pt-0.5">
                <span
                  className={cn(
                    'block text-sm font-semibold leading-5',
                    status === 'upcoming' ? 'text-mute' : 'text-ink'
                  )}
                >
                  {t(`steps.${key}.title`)}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-mute">
                  {t(`steps.${key}.description`)}
                </span>
              </span>
            </li>
          )
        })}
      </ol>

      {completionPercent !== null ? (
        <div className="mt-8">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink">
            <span>{t('sidebar.completionLabel')}</span>
            <span className="tabular-nums text-primary">{completionPercent}%</span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#E2E8F0]">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>
      ) : null}
    </aside>
  )
}
