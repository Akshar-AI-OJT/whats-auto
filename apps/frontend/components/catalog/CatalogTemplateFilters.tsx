'use client'

import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
} from '@/components/dashboard/templates/template-utils'

export type CatalogTemplateFilterValues = {
  search: string
  category: string
  language: string
  industry: string
  topic: string
  status?: string
  source?: string
}

type CatalogTemplateFiltersProps = {
  values: CatalogTemplateFilterValues
  onChange: (patch: Partial<CatalogTemplateFilterValues>) => void
  onClear: () => void
  showAdminFilters?: boolean
}

const selectClassName = cn(
  'h-10 w-full min-w-0 rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'transition-[border-color,box-shadow] duration-200',
  'hover:border-dash-border-strong',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

export function CatalogTemplateFilters({
  values,
  onChange,
  onClear,
  showAdminFilters = false,
}: CatalogTemplateFiltersProps) {
  const t = useTranslations('catalog.templates.filters')
  const hasActive = Boolean(
    values.search.trim() ||
      values.category ||
      values.language ||
      values.industry.trim() ||
      values.topic.trim() ||
      values.status ||
      values.source
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="relative min-w-0">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
          aria-hidden
        />
        <Input
          value={values.search}
          onChange={(event) => onChange({ search: event.target.value })}
          placeholder={t('search')}
          className="h-10 rounded-xl pl-9"
          aria-label={t('search')}
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <select
          className={selectClassName}
          value={values.category}
          onChange={(event) => onChange({ category: event.target.value })}
          aria-label={t('category')}
        >
          <option value="">{t('allCategories')}</option>
          {TEMPLATE_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          className={selectClassName}
          value={values.language}
          onChange={(event) => onChange({ language: event.target.value })}
          aria-label={t('language')}
        >
          <option value="">{t('allLanguages')}</option>
          {TEMPLATE_LANGUAGES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <Input
          value={values.industry}
          onChange={(event) => onChange({ industry: event.target.value })}
          placeholder={t('industry')}
          aria-label={t('industry')}
          className="h-10 rounded-xl"
        />
        <Input
          value={values.topic}
          onChange={(event) => onChange({ topic: event.target.value })}
          placeholder={t('topic')}
          aria-label={t('topic')}
          className="h-10 rounded-xl"
        />
        {showAdminFilters ? (
          <>
            <select
              className={selectClassName}
              value={values.status ?? ''}
              onChange={(event) => onChange({ status: event.target.value })}
              aria-label={t('status')}
            >
              <option value="">{t('allStatuses')}</option>
              <option value="DRAFT">DRAFT</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
            <select
              className={selectClassName}
              value={values.source ?? ''}
              onChange={(event) => onChange({ source: event.target.value })}
              aria-label={t('source')}
            >
              <option value="">{t('allSources')}</option>
              <option value="META_LIBRARY">META_LIBRARY</option>
              <option value="MANUAL">MANUAL</option>
            </select>
          </>
        ) : null}
      </div>
      {hasActive ? (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            {t('clear')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
