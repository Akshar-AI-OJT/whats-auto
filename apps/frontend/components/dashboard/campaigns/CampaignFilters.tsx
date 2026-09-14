'use client'

import { useTranslations } from 'next-intl'
import { LayoutGrid, List, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { CampaignViewMode } from './campaign-utils'

type CampaignFiltersProps = {
  search: string
  startDate: string
  endDate: string
  viewMode: CampaignViewMode
  onSearchChange: (value: string) => void
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onSearch: () => void
  onClear: () => void
  onViewModeChange: (mode: CampaignViewMode) => void
}

export function CampaignFilters({
  search,
  startDate,
  endDate,
  viewMode,
  onSearchChange,
  onStartDateChange,
  onEndDateChange,
  onSearch,
  onClear,
  onViewModeChange,
}: CampaignFiltersProps) {
  const t = useTranslations('dashboard.campaigns')

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-2">
          <span className="text-xs font-medium text-mute">{t('filters.search')}</span>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSearch()
              }}
              placeholder={t('searchPlaceholder')}
              className="h-11 pl-10"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-mute">{t('filters.startDate')}</span>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="h-11"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-mute">{t('filters.endDate')}</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="h-11"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="gap-2" onClick={onSearch}>
          <Search className="size-4" aria-hidden />
          {t('filters.searchCta')}
        </Button>
        <Button type="button" variant="outline" onClick={onClear}>
          {t('filters.clear')}
        </Button>
        <div className="inline-flex rounded-xl border border-dash-border bg-canvas p-1">
          <button
            type="button"
            onClick={() => onViewModeChange('cards')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              viewMode === 'cards'
                ? 'bg-primary text-on-primary'
                : 'text-body hover:bg-dash-hover hover:text-ink'
            )}
            aria-pressed={viewMode === 'cards'}
          >
            <LayoutGrid className="size-4" aria-hidden />
            {t('views.cards')}
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              viewMode === 'list'
                ? 'bg-primary text-on-primary'
                : 'text-body hover:bg-dash-hover hover:text-ink'
            )}
            aria-pressed={viewMode === 'list'}
          >
            <List className="size-4" aria-hidden />
            {t('views.list')}
          </button>
        </div>
      </div>
    </div>
  )
}
