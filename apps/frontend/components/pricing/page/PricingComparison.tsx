import { Check, Minus } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'
import { FeaturesAurora } from '@/components/features/page/FeaturesAurora'
import { FeaturesReveal } from '@/components/features/page/FeaturesReveal'

const ROW_KEYS = [
  'ai',
  'broadcast',
  'inbox',
  'templates',
  'analytics',
  'multiTenant',
  'workflow',
  'prioritySupport',
  'dedicatedSupport',
] as const

type Cell = 'yes' | 'no' | 'custom'

const MATRIX: Record<(typeof ROW_KEYS)[number], [Cell, Cell, Cell]> = {
  ai: ['yes', 'yes', 'yes'],
  broadcast: ['yes', 'yes', 'yes'],
  inbox: ['yes', 'yes', 'yes'],
  templates: ['yes', 'yes', 'yes'],
  analytics: ['yes', 'yes', 'yes'],
  multiTenant: ['no', 'yes', 'yes'],
  workflow: ['no', 'yes', 'yes'],
  prioritySupport: ['no', 'yes', 'yes'],
  dedicatedSupport: ['no', 'no', 'custom'],
}

function CellValue({ value, label }: { value: Cell; label: string }) {
  if (value === 'yes') {
    return (
      <span className="inline-flex items-center justify-center text-positive-deep" aria-label={label}>
        <Check className="size-4 stroke-[2.5]" aria-hidden />
      </span>
    )
  }
  if (value === 'custom') {
    return (
      <span className="text-xs font-semibold text-ink" aria-label={label}>
        {label}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center text-mute" aria-label={label}>
      <Minus className="size-4" aria-hidden />
    </span>
  )
}

export async function PricingComparison() {
  const t = await getTranslations('pricingPage.comparison')

  const plans = [
    { key: 'starter', label: t('columns.starter') },
    { key: 'growth', label: t('columns.growth') },
    { key: 'enterprise', label: t('columns.enterprise') },
  ] as const

  return (
    <section className="relative overflow-x-clip py-16 sm:py-20 md:py-24">
      <FeaturesAurora />
      <div className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-6">
        <FeaturesReveal className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
          <h2 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
            {t('title')}
          </h2>
          <p className="mt-4 text-base leading-7 text-body sm:text-lg">
            {t('subtitle')}
          </p>
        </FeaturesReveal>

        {/* Desktop / tablet table */}
        <FeaturesReveal className="hidden overflow-hidden rounded-[28px] border border-[#E2E8F0] bg-canvas shadow-[0_1px_2px_rgb(15_23_42/0.04),0_16px_40px_rgb(15_23_42/0.06)] md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="px-5 py-4 text-sm font-semibold text-ink sm:px-6">
                    {t('featureLabel')}
                  </th>
                  {plans.map((plan) => (
                    <th
                      key={plan.key}
                      className="px-4 py-4 text-center text-sm font-semibold text-ink"
                    >
                      {plan.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROW_KEYS.map((row, i) => (
                  <tr
                    key={row}
                    className={cn(
                      'border-b border-[#E2E8F0] last:border-b-0',
                      i % 2 === 1 && 'bg-[#F8FAFC]/60'
                    )}
                  >
                    <td className="px-5 py-3.5 text-sm text-body sm:px-6">
                      {t(`rows.${row}`)}
                    </td>
                    {MATRIX[row].map((cell, col) => (
                      <td key={col} className="px-4 py-3.5 text-center">
                        <CellValue
                          value={cell}
                          label={
                            cell === 'custom'
                              ? t('values.custom')
                              : cell === 'yes'
                                ? t('values.yes')
                                : t('values.no')
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FeaturesReveal>

        {/* Mobile stacked cards */}
        <ul className="flex flex-col gap-4 md:hidden">
          {plans.map((plan, planIndex) => (
            <li key={plan.key}>
              <FeaturesReveal delayMs={planIndex * 60}>
                <article className="rounded-[28px] border border-[#E2E8F0] bg-canvas p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_rgb(15_23_42/0.05)]">
                  <h3 className="text-base font-semibold text-ink">{plan.label}</h3>
                  <ul className="mt-4 flex flex-col gap-2.5">
                    {ROW_KEYS.map((row) => {
                      const cell = MATRIX[row][planIndex]
                      return (
                        <li
                          key={row}
                          className="flex items-center justify-between gap-3 border-b border-[#E2E8F0]/80 py-2 last:border-b-0"
                        >
                          <span className="text-sm text-body">{t(`rows.${row}`)}</span>
                          <CellValue
                            value={cell}
                            label={
                              cell === 'custom'
                                ? t('values.custom')
                                : cell === 'yes'
                                  ? t('values.yes')
                                  : t('values.no')
                            }
                          />
                        </li>
                      )
                    })}
                  </ul>
                </article>
              </FeaturesReveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
