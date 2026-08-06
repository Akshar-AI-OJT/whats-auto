'use client'

import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
  TEMPLATE_STATUS_TABS,
  type TemplateStatusTab,
} from './template-utils'

type TemplateFiltersProps = {
  search: string
  category: string
  statusTab: TemplateStatusTab
  language: string
  onSearchChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onStatusTabChange: (value: TemplateStatusTab) => void
  onLanguageChange: (value: string) => void
}

const selectClassName = cn(
  'h-10 rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

export function TemplateFilters({
  search,
  category,
  statusTab,
  language,
  onSearchChange,
  onCategoryChange,
  onStatusTabChange,
  onLanguageChange,
}: TemplateFiltersProps) {
  const t = useTranslations('dashboard.templates')

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="h-10 rounded-xl pl-9"
            aria-label={t('searchPlaceholder')}
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto">
          <select
            className={selectClassName}
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            aria-label={t('filters.category')}
          >
            <option value="">{t('filters.allCategories')}</option>
            {TEMPLATE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {t(`categories.${value}`)}
              </option>
            ))}
          </select>
          <select
            className={selectClassName}
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            aria-label={t('filters.language')}
          >
            <option value="">{t('filters.allLanguages')}</option>
            {TEMPLATE_LANGUAGES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className={selectClassName}
            value={statusTab === 'all' ? '' : statusTab}
            onChange={(e) =>
              onStatusTabChange((e.target.value || 'all') as TemplateStatusTab)
            }
            aria-label={t('filters.status')}
          >
            <option value="">{t('filters.allStatuses')}</option>
            <option value="approved">{t('tabs.approved')}</option>
            <option value="pending">{t('tabs.pending')}</option>
            <option value="rejected">{t('tabs.rejected')}</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-dash-border pb-1">
        {TEMPLATE_STATUS_TABS.map((tab) => {
          const active = statusTab === tab
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onStatusTabChange(tab)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary-pale text-positive-deep'
                  : 'text-mute hover:bg-dash-surface hover:text-ink'
              )}
            >
              {t(`tabs.${tab}`)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
