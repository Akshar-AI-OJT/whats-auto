'use client'

import { useTranslations } from 'next-intl'
import { Check, FileText, ImageIcon } from 'lucide-react'
import type { WhatsappMessageTemplate, WhatsappTemplateButton } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  normalizeButtons,
  normalizeSampleValues,
  renderTemplatePreviewText,
} from './template-utils'

type TemplatePreviewProps = {
  name?: string
  headerType?: string | null
  headerContent?: string | null
  headerMediaUrl?: string | null
  bodyText: string
  footerText?: string | null
  buttons?: WhatsappTemplateButton[] | null
  sampleValues?: Record<string, string>
  businessName?: string
  className?: string
}

export function TemplatePreview({
  name,
  headerType,
  headerContent,
  headerMediaUrl,
  bodyText,
  footerText,
  buttons,
  sampleValues,
  businessName,
  className,
}: TemplatePreviewProps) {
  const t = useTranslations('dashboard.templates.preview')
  const resolvedButtons = normalizeButtons(buttons)
  const headerUpper = headerType?.toUpperCase() ?? 'NONE'
  const isImageHeader = headerUpper === 'IMAGE'
  const isDocumentHeader = headerUpper === 'DOCUMENT'
  const textHeader =
    headerUpper === 'TEXT' && headerContent
      ? renderTemplatePreviewText(headerContent, sampleValues)
      : null

  return (
    <div className={cn('rounded-2xl border border-dash-border bg-dash-surface/40 p-4', className)}>
      <p className="text-xs font-semibold tracking-wide text-mute uppercase">{t('title')}</p>
      <div className="mt-3 overflow-hidden rounded-[1.6rem] border border-[#D1D5DB] bg-[#ECE5DD] shadow-[0_10px_30px_rgb(15_23_42/0.08)]">
        <div className="flex items-center gap-2 border-b border-black/5 bg-[#075E54] px-3 py-2.5 text-white">
          <span className="flex size-8 items-center justify-center rounded-full bg-white/15 text-xs font-semibold">
            {(businessName ?? t('businessFallback')).slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {businessName ?? t('businessFallback')}
            </p>
            {name ? <p className="truncate text-[11px] text-white/75">{name}</p> : null}
          </div>
          <Check className="size-3.5 text-[#2563eb]" aria-hidden />
        </div>

        <div className="space-y-2 px-3 py-4">
          <div className="max-w-[92%] overflow-hidden rounded-xl rounded-tl-sm bg-canvas text-sm leading-6 text-ink shadow-sm">
            {isImageHeader ? (
              <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-[#D1D7DB]">
                {headerMediaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={headerMediaUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-mute">
                    <ImageIcon className="size-8" />
                    <span className="text-xs font-medium">{t('imageHeaderPlaceholder')}</span>
                  </div>
                )}
              </div>
            ) : null}

            {isDocumentHeader ? (
              <div className="flex items-center gap-2 border-b border-dash-border bg-dash-surface/50 px-3 py-2.5 text-mute">
                <FileText className="size-5 shrink-0" />
                <span className="truncate text-xs font-medium">
                  {headerMediaUrl ? t('documentHeaderSelected') : t('documentHeaderPlaceholder')}
                </span>
              </div>
            ) : null}

            <div className="px-3 py-2.5">
              {textHeader ? <p className="mb-1 font-semibold">{textHeader}</p> : null}
              <p className="whitespace-pre-wrap">
                {renderTemplatePreviewText(bodyText, sampleValues) || t('emptyBody')}
              </p>
              {footerText ? (
                <p className="mt-2 text-xs text-mute">{renderTemplatePreviewText(footerText)}</p>
              ) : null}
              {resolvedButtons.length > 0 ? (
                <div className="mt-3 space-y-1.5 border-t border-dash-border pt-2">
                  {resolvedButtons.map((button, index) => (
                    <div
                      key={`${button.text ?? 'btn'}-${index}`}
                      className="rounded-lg bg-primary-pale/60 px-2.5 py-1.5 text-center text-xs font-semibold text-positive-deep"
                    >
                      {button.text || t('buttonFallback')}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function templateToPreviewProps(template: WhatsappMessageTemplate): TemplatePreviewProps {
  return {
    name: template.name,
    headerType: template.headerType,
    headerContent: template.headerContent,
    headerMediaUrl: template.headerMediaUrl,
    bodyText: template.bodyText,
    footerText: template.footerText,
    buttons: normalizeButtons(template.buttons),
    sampleValues: normalizeSampleValues(template.sampleValues),
  }
}
