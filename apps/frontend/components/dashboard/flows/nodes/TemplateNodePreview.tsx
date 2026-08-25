'use client'

import { ImageIcon } from 'lucide-react'
import type { WhatsappMessageTemplate } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  normalizeButtons,
  normalizeSampleValues,
  renderTemplatePreviewText,
} from '@/components/dashboard/templates/template-utils'

/** Compact in-canvas template bubble — no phone chrome. */
export function TemplateNodePreview({
  template,
  className,
}: {
  template: WhatsappMessageTemplate | null
  className?: string
}) {
  if (!template) {
    return (
      <p className={cn('text-[11px] text-mute', className)}>Select a template in the inspector.</p>
    )
  }

  const headerUpper = template.headerType?.toUpperCase() ?? 'NONE'
  const isImage = headerUpper === 'IMAGE'
  const isDocument = headerUpper === 'DOCUMENT'
  const sampleValues = normalizeSampleValues(template.sampleValues)
  const buttons = normalizeButtons(template.buttons)
  const textHeader =
    headerUpper === 'TEXT' && template.headerContent
      ? renderTemplatePreviewText(template.headerContent, sampleValues)
      : null

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-dash-border bg-[#DCF8C6]/60 text-[11px] leading-4 text-ink',
        className
      )}
    >
      {isImage ? (
        <div className="relative flex aspect-[2/1] w-full items-center justify-center overflow-hidden bg-dash-surface">
          {template.headerMediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={template.headerMediaUrl} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-5 text-mute" aria-hidden />
          )}
        </div>
      ) : null}
      {isDocument ? (
        <div className="border-b border-dash-border bg-dash-surface/70 px-2 py-1.5 text-mute">
          Media header
        </div>
      ) : null}
      <div className="space-y-1 px-2 py-1.5">
        {textHeader ? <p className="font-semibold">{textHeader}</p> : null}
        <p className="line-clamp-4 whitespace-pre-wrap">
          {renderTemplatePreviewText(template.bodyText, sampleValues) || 'Empty body'}
        </p>
        {template.footerText ? (
          <p className="text-[10px] text-mute">
            {renderTemplatePreviewText(template.footerText, sampleValues)}
          </p>
        ) : null}
        {buttons.length > 0 ? (
          <ul className="space-y-1 border-t border-dash-border/80 pt-1.5">
            {buttons.map((button, index) => (
              <li
                key={`${button.text ?? 'btn'}-${index}`}
                className="rounded-md bg-canvas px-2 py-1 text-center text-[10px] font-semibold text-positive-deep"
              >
                {button.text || 'Button'}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
