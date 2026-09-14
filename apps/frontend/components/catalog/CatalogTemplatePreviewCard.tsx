import type { ReactNode } from 'react'
import type { WhatsappTemplateButton } from '@/lib/api'
import { TemplateCategoryPill } from '@/components/dashboard/templates/TemplateCategoryPill'
import { TemplatePreview } from '@/components/dashboard/templates/TemplatePreview'
import { formatTemplateLanguage } from '@/components/dashboard/templates/template-utils'
import { cn } from '@/lib/utils'

type CatalogTemplatePreviewCardProps = {
  name: string
  language?: string | null
  category?: string | null
  headerType?: string | null
  headerContent?: string | null
  bodyText: string
  footerText?: string | null
  buttons?: WhatsappTemplateButton[] | null
  sampleValues?: Record<string, string>
  extraMeta?: string | null
  actions?: ReactNode
  leading?: ReactNode
  className?: string
  selectable?: boolean
  selected?: boolean
  onSelectChange?: (selected: boolean) => void
}

export function CatalogTemplatePreviewCard({
  name,
  language,
  category,
  headerType,
  headerContent,
  bodyText,
  footerText,
  buttons,
  sampleValues,
  extraMeta,
  actions,
  leading,
  className,
  selectable = false,
  selected = false,
  onSelectChange,
}: CatalogTemplatePreviewCardProps) {
  return (
    <article
      className={cn(
        'flex w-full flex-col gap-3 self-start rounded-xl border border-dash-border bg-canvas p-3',
        selectable && 'cursor-pointer',
        selected && 'border-primary ring-2 ring-primary/25',
        className
      )}
      onClick={
        selectable && onSelectChange ? () => onSelectChange(!selected) : undefined
      }
    >
      <div className="flex min-w-0 items-start gap-2">
        {leading ? (
          <div onClick={(event) => event.stopPropagation()}>{leading}</div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {category ? <TemplateCategoryPill category={category} /> : null}
            {language ? (
              <span className="text-xs text-mute">{formatTemplateLanguage(language)}</span>
            ) : null}
            {extraMeta ? <span className="text-xs text-mute">{extraMeta}</span> : null}
          </div>
        </div>
      </div>
      <TemplatePreview
        compact
        name={name}
        headerType={headerType}
        headerContent={headerContent}
        bodyText={bodyText}
        footerText={footerText}
        buttons={buttons}
        sampleValues={sampleValues}
      />
      {actions ? (
        <div
          className="flex flex-wrap gap-2"
          onClick={selectable ? (event) => event.stopPropagation() : undefined}
        >
          {actions}
        </div>
      ) : null}
    </article>
  )
}

export function CatalogTemplatePreviewGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  )
}
