'use client'

import { useTranslations } from 'next-intl'
import { Check, Crown, Rocket, ShieldCheck, Users } from 'lucide-react'
import { AppLogo } from '@/components/branding/AppLogo'
import { cn } from '@/lib/utils'
import type { OrgWizardStep } from './organization-wizard-types'

type SidebarItemStatus = 'done' | 'active' | 'upcoming'

type SidebarItem = {
  key: 'accountVerified' | 'organizationCreated' | 'companyDetails' | 'preferences' | 'planReview'
  status: SidebarItemStatus
  number: number
}

function getSidebarItems(step: OrgWizardStep): SidebarItem[] {
  return [
    { key: 'accountVerified', status: 'done', number: 1 },
    {
      key: step === 2 ? 'companyDetails' : 'organizationCreated',
      status: step <= 2 ? 'active' : 'done',
      number: step === 2 ? 2 : 1,
    },
    {
      key: 'preferences',
      status: step === 3 ? 'active' : step > 3 ? 'done' : 'upcoming',
      number: 3,
    },
    {
      key: 'planReview',
      status: step === 4 ? 'active' : 'upcoming',
      number: 4,
    },
  ]
}

export function OrganizationOnboardingSidebar({
  currentStep,
}: {
  currentStep: OrgWizardStep
}) {
  const t = useTranslations('onboarding.organization.sidebar')
  const items = getSidebarItems(currentStep)

  return (
    <aside className="relative flex w-full shrink-0 flex-col border-b border-[#E2E8F0] bg-[#F5F7FA] md:sticky md:top-5 md:w-[34%] md:max-w-[360px] md:self-start md:border-r md:border-b-0 lg:w-[340px]">
      <div className="flex flex-col items-start px-5 py-6 sm:px-6 sm:py-7 md:px-7 md:py-8">
        <AppLogo size="sm" className="self-start" priority />

        <div className="mt-7 flex w-full flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Rocket className="size-6" aria-hidden />
            </span>
            <div className="flex flex-col gap-1.5">
              <h2 className="font-display text-[1.35rem] leading-7 tracking-tight text-ink sm:text-[1.5rem] sm:leading-8">
                {t('heading')}
              </h2>
              <p className="text-sm leading-6 text-body">{t('subtitle')}</p>
            </div>
          </div>

          <div className="w-full rounded-2xl border border-[#E2E8F0] bg-canvas p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_8px_24px_rgb(15_23_42/0.04)]">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm">
                <Users className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{t('setupTitle')}</p>
                <p className="text-xs leading-5 text-mute">
                  {t('setupStep', { step: currentStep, total: 4 })}
                </p>
              </div>
            </div>

            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.key} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                      item.status === 'done' && 'bg-primary text-on-primary',
                      item.status === 'active' && 'bg-primary text-on-primary ring-4 ring-primary/15',
                      item.status === 'upcoming' && 'border border-[#E2E8F0] bg-[#F8FAFC] text-mute'
                    )}
                    aria-current={item.status === 'active' ? 'step' : undefined}
                  >
                    {item.status === 'done' ? (
                      <Check className="size-3.5 stroke-[2.5]" aria-hidden />
                    ) : (
                      item.number
                    )}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 text-xs font-medium',
                      item.status === 'upcoming' ? 'text-body' : 'text-ink'
                    )}
                  >
                    {t(item.key)}
                  </span>
                  {item.status === 'done' ? (
                    <span className="rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[10px] font-semibold text-positive-deep">
                      {t('done')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-canvas px-3.5 py-3 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Crown className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{t('ownerTitle')}</p>
                <p className="text-xs leading-4 text-mute">{t('ownerSubtitle')}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-canvas px-3.5 py-3 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF3] text-positive-deep">
                <ShieldCheck className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{t('readyTitle')}</p>
                <p className="text-xs leading-4 text-mute">{t('readySubtitle')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
