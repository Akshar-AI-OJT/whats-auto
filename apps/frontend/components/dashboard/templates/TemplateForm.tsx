'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bold, Italic, Loader2, Plus, Strikethrough, Variable } from 'lucide-react'
import type {
  CreateWhatsappTemplateBody,
  WhatsappTemplateButton,
  WhatsappTemplateCategory,
  WhatsappTemplateHeaderType,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { TemplatePreview } from './TemplatePreview'
import { MediaPicker } from './MediaPicker'
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_HEADER_TYPES,
  TEMPLATE_LANGUAGES,
  buildNumericSampleValues,
  extractTemplateVariables,
  missingSampleVariables,
} from './template-utils'

export type TemplateFormValues = {
  name: string
  category: WhatsappTemplateCategory
  language: string
  headerType: WhatsappTemplateHeaderType
  headerContent: string
  headerMediaAssetId: string
  headerMediaFileName: string
  bodyText: string
  footerText: string
  buttons: WhatsappTemplateButton[]
  sampleValues: Record<string, string>
}

const selectClassName = cn(
  'h-11 w-full rounded-xl border border-dash-border bg-canvas px-3 text-sm text-ink outline-none',
  'focus-visible:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/30'
)

export const EMPTY_TEMPLATE_FORM: TemplateFormValues = {
  name: '',
  category: 'UTILITY',
  language: 'en_US',
  headerType: 'NONE',
  headerContent: '',
  headerMediaAssetId: '',
  headerMediaFileName: '',
  bodyText: '',
  footerText: '',
  buttons: [],
  sampleValues: {},
}

type TemplateFormProps = {
  initialValues?: Partial<TemplateFormValues>
  pending?: boolean
  error?: string | null
  submitLabel: string
  secondaryLabel?: string
  onSubmit: (body: CreateWhatsappTemplateBody, mode: 'draft' | 'submit') => void
  onCancel: () => void
}

export function TemplateForm({
  initialValues,
  pending = false,
  error,
  submitLabel,
  secondaryLabel,
  onSubmit,
  onCancel,
}: TemplateFormProps) {
  const t = useTranslations('dashboard.templates.form')
  const [values, setValues] = useState<TemplateFormValues>({
    ...EMPTY_TEMPLATE_FORM,
    ...initialValues,
  })
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof TemplateFormValues, string>>>(
    {}
  )
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)

  const [sampleErrors, setSampleErrors] = useState<Record<string, string>>({})

  const variables = useMemo(() => {
    const headerText = values.headerType === 'TEXT' ? values.headerContent : ''
    return extractTemplateVariables(values.bodyText, headerText)
  }, [values.bodyText, values.headerContent, values.headerType])

  const missingSamples = useMemo(
    () => missingSampleVariables(variables, values.sampleValues),
    [variables, values.sampleValues]
  )

  const samplesComplete = missingSamples.length === 0
  const canSubmit = !pending && samplesComplete

  function update<K extends keyof TemplateFormValues>(key: K, value: TemplateFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function updateSample(variable: string, value: string) {
    setValues((prev) => ({
      ...prev,
      sampleValues: {
        ...prev.sampleValues,
        [variable]: value,
      },
    }))
    setSampleErrors((prev) => {
      if (!prev[variable]) return prev
      const next = { ...prev }
      delete next[variable]
      return next
    })
  }

  function insertVariable() {
    const nextIndex = variables.length > 0 ? Number(variables[variables.length - 1]) + 1 : 1
    update('bodyText', `${values.bodyText}{{${nextIndex}}}`)
  }

  function addButton() {
    if (values.buttons.length >= 3) return
    update('buttons', [...values.buttons, { type: 'QUICK_REPLY', text: '' }])
  }

  function updateButton(index: number, patch: Partial<WhatsappTemplateButton>) {
    update(
      'buttons',
      values.buttons.map((button, i) => (i === index ? { ...button, ...patch } : button))
    )
  }

  function removeButton(index: number) {
    update(
      'buttons',
      values.buttons.filter((_, i) => i !== index)
    )
  }

  function validate(): boolean {
    const next: Partial<Record<keyof TemplateFormValues, string>> = {}
    if (!/^[a-z0-9_]+$/.test(values.name.trim())) next.name = t('errors.nameInvalid')
    if (!values.bodyText.trim()) next.bodyText = t('errors.bodyRequired')
    if (values.bodyText.trim().length > 1024) next.bodyText = t('errors.bodyTooLong')
    if (values.headerType === 'TEXT' && !values.headerContent.trim()) {
      next.headerContent = t('errors.headerRequired')
    }

    const nextSampleErrors: Record<string, string> = {}
    for (const key of missingSampleVariables(variables, values.sampleValues)) {
      nextSampleErrors[key] = t('errors.sampleRequired', { n: key })
    }
    if (Object.keys(nextSampleErrors).length > 0) {
      next.sampleValues = t('errors.samplesRequired')
    }

    setFieldErrors(next)
    setSampleErrors(nextSampleErrors)
    return Object.keys(next).length === 0
  }

  function buildBody(): CreateWhatsappTemplateBody {
    const sampleValues = buildNumericSampleValues(variables, values.sampleValues)

    const body: CreateWhatsappTemplateBody = {
      name: values.name.trim().toLowerCase(),
      category: values.category,
      language: values.language,
      bodyText: values.bodyText.trim(),
    }

    if (Object.keys(sampleValues).length > 0) {
      body.sampleValues = sampleValues
    }

    if (values.headerType !== 'NONE') {
      body.headerType = values.headerType
      if (values.headerType === 'TEXT' && values.headerContent.trim()) {
        body.headerContent = values.headerContent.trim()
      }
    } else {
      body.headerType = 'NONE'
    }

    if (values.footerText.trim()) body.footerText = values.footerText.trim()

    const cleanedButtons = values.buttons
      .map((button) => ({
        type: button.type || 'QUICK_REPLY',
        text: String(button.text || '').trim(),
        ...(button.type === 'URL' && button.url ? { url: String(button.url).trim() } : {}),
        ...(button.type === 'PHONE_NUMBER' && button.phone_number
          ? { phone_number: String(button.phone_number).trim() }
          : {}),
      }))
      .filter((button) => button.text.length > 0)

    if (cleanedButtons.length > 0) body.buttons = cleanedButtons
    return body
  }

  function handleSubmit(mode: 'draft' | 'submit') {
    if (!validate()) return
    const body = buildBody()
    console.log('[templates] create payload', body)
    onSubmit(body, mode)
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <FieldGroup className="gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field data-invalid={Boolean(fieldErrors.name)} className="gap-2">
              <FieldLabel>{t('name')}</FieldLabel>
              <Input
                value={values.name}
                onChange={(e) => update('name', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                placeholder={t('namePlaceholder')}
                disabled={pending}
              />
              <FieldDescription>{t('nameHint')}</FieldDescription>
              {fieldErrors.name ? <FieldError>{fieldErrors.name}</FieldError> : null}
            </Field>

            <Field className="gap-2">
              <FieldLabel>{t('category')}</FieldLabel>
              <select
                className={selectClassName}
                value={values.category}
                disabled={pending}
                onChange={(e) => update('category', e.target.value as WhatsappTemplateCategory)}
              >
                {TEMPLATE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(`categories.${category}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field className="gap-2">
              <FieldLabel>{t('language')}</FieldLabel>
              <select
                className={selectClassName}
                value={values.language}
                disabled={pending}
                onChange={(e) => update('language', e.target.value)}
              >
                {TEMPLATE_LANGUAGES.map((language) => (
                  <option key={language.value} value={language.value}>
                    {language.label} ({language.value})
                  </option>
                ))}
              </select>
            </Field>

            <Field className="gap-2">
              <FieldLabel>{t('headerType')}</FieldLabel>
              <select
                className={selectClassName}
                value={values.headerType}
                disabled={pending}
                onChange={(e) => {
                  const next = e.target.value as WhatsappTemplateHeaderType
                  setValues((prev) => ({
                    ...prev,
                    headerType: next,
                    headerMediaAssetId:
                      next === 'IMAGE' || next === 'DOCUMENT' ? prev.headerMediaAssetId : '',
                    headerMediaFileName:
                      next === 'IMAGE' || next === 'DOCUMENT' ? prev.headerMediaFileName : '',
                  }))
                }}
              >
                {TEMPLATE_HEADER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`headerTypes.${type}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {values.headerType === 'TEXT' ? (
            <Field data-invalid={Boolean(fieldErrors.headerContent)} className="gap-2">
              <FieldLabel>{t('headerContent')}</FieldLabel>
              <Input
                value={values.headerContent}
                maxLength={60}
                disabled={pending}
                onChange={(e) => update('headerContent', e.target.value)}
                placeholder={t('headerPlaceholder')}
              />
              {fieldErrors.headerContent ? (
                <FieldError>{fieldErrors.headerContent}</FieldError>
              ) : null}
            </Field>
          ) : null}

          {values.headerType === 'IMAGE' || values.headerType === 'DOCUMENT' ? (
            <Field className="gap-2">
              <FieldLabel>{t('headerMedia')}</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setMediaPickerOpen(true)}
                >
                  {values.headerMediaFileName || t('headerMediaPick')}
                </Button>
                {values.headerMediaAssetId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      update('headerMediaAssetId', '')
                      update('headerMediaFileName', '')
                    }}
                  >
                    {t('headerMediaClear')}
                  </Button>
                ) : null}
              </div>
              <FieldDescription>{t('headerMediaHint')}</FieldDescription>
            </Field>
          ) : null}

          <MediaPicker
            open={mediaPickerOpen}
            onOpenChange={setMediaPickerOpen}
            kind={values.headerType === 'IMAGE' ? 'image' : 'document'}
            onSelect={(asset) => {
              update('headerMediaAssetId', asset.id)
              update('headerMediaFileName', asset.fileName)
            }}
          />

          <Field data-invalid={Boolean(fieldErrors.bodyText)} className="gap-2">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel>{t('body')}</FieldLabel>
              <p className="text-xs tabular-nums text-mute">{values.bodyText.length}/1024</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-dash-border">
              <div className="flex flex-wrap gap-1 border-b border-dash-border bg-dash-surface/50 px-2 py-1.5">
                <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-lg text-mute hover:bg-canvas hover:text-ink"
                  onClick={() => update('bodyText', `*${values.bodyText}*`)}
                  aria-label={t('formatBold')}
                >
                  <Bold className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-lg text-mute hover:bg-canvas hover:text-ink"
                  onClick={() => update('bodyText', `_${values.bodyText}_`)}
                  aria-label={t('formatItalic')}
                >
                  <Italic className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-lg text-mute hover:bg-canvas hover:text-ink"
                  onClick={() => update('bodyText', `~${values.bodyText}~`)}
                  aria-label={t('formatStrike')}
                >
                  <Strikethrough className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-mute hover:bg-canvas hover:text-ink"
                  onClick={insertVariable}
                >
                  <Variable className="size-3.5" />
                  {t('insertVariable')}
                </button>
              </div>
              <textarea
                value={values.bodyText}
                maxLength={1024}
                disabled={pending}
                onChange={(e) => update('bodyText', e.target.value)}
                placeholder={t('bodyPlaceholder')}
                className="min-h-40 w-full resize-y bg-canvas px-3 py-3 text-sm text-ink outline-none"
              />
            </div>
            {fieldErrors.bodyText ? <FieldError>{fieldErrors.bodyText}</FieldError> : null}
          </Field>

          {variables.length > 0 ? (
            <div
              className={cn(
                'space-y-2 rounded-xl border p-3',
                fieldErrors.sampleValues
                  ? 'border-negative/35 bg-negative/5'
                  : 'border-dash-border bg-dash-surface/40'
              )}
            >
              <div>
                <p className="text-sm font-semibold text-ink">{t('variables')}</p>
                <p className="text-xs text-mute">{t('variablesHint')}</p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {variables.map((variable) => (
                  <Field
                    key={variable}
                    data-invalid={Boolean(sampleErrors[variable])}
                    className="gap-1.5"
                  >
                    <FieldLabel className="text-xs">{`{{${variable}}}`}</FieldLabel>
                    <Input
                      value={values.sampleValues[variable] ?? ''}
                      disabled={pending}
                      placeholder={t('samplePlaceholder', { n: variable })}
                      onChange={(e) => updateSample(variable, e.target.value)}
                    />
                    {sampleErrors[variable] ? (
                      <FieldError>{sampleErrors[variable]}</FieldError>
                    ) : null}
                  </Field>
                ))}
              </div>
              {fieldErrors.sampleValues ? (
                <FieldError>{fieldErrors.sampleValues}</FieldError>
              ) : null}
            </div>
          ) : null}

          <Field className="gap-2">
            <FieldLabel>{t('footer')}</FieldLabel>
            <Input
              value={values.footerText}
              maxLength={60}
              disabled={pending}
              onChange={(e) => update('footerText', e.target.value)}
              placeholder={t('footerPlaceholder')}
            />
          </Field>

          <div className="space-y-3 rounded-xl border border-dash-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{t('buttons')}</p>
                <p className="text-xs text-mute">{t('buttonsHint')}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={pending || values.buttons.length >= 3}
                onClick={addButton}
              >
                <Plus className="size-3.5" />
                {t('addButton')}
              </Button>
            </div>
            {values.buttons.map((button, index) => (
              <div
                key={`button-${index}`}
                className="grid grid-cols-1 gap-2 rounded-lg border border-dash-border bg-dash-surface/30 p-2.5 sm:grid-cols-[140px_minmax(0,1fr)_auto]"
              >
                <select
                  className={selectClassName}
                  value={String(button.type || 'QUICK_REPLY')}
                  disabled={pending}
                  onChange={(e) => updateButton(index, { type: e.target.value })}
                >
                  <option value="QUICK_REPLY">{t('buttonTypes.QUICK_REPLY')}</option>
                  <option value="URL">{t('buttonTypes.URL')}</option>
                  <option value="PHONE_NUMBER">{t('buttonTypes.PHONE_NUMBER')}</option>
                </select>
                <Input
                  value={String(button.text || '')}
                  disabled={pending}
                  placeholder={t('buttonTextPlaceholder')}
                  onChange={(e) => updateButton(index, { text: e.target.value })}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => removeButton(index)}
                >
                  {t('removeButton')}
                </Button>
                {button.type === 'URL' ? (
                  <Input
                    className="sm:col-span-3"
                    value={String(button.url || '')}
                    disabled={pending}
                    placeholder={t('buttonUrlPlaceholder')}
                    onChange={(e) => updateButton(index, { url: e.target.value })}
                  />
                ) : null}
                {button.type === 'PHONE_NUMBER' ? (
                  <Input
                    className="sm:col-span-3"
                    value={String(button.phone_number || '')}
                    disabled={pending}
                    placeholder={t('buttonPhonePlaceholder')}
                    onChange={(e) => updateButton(index, { phone_number: e.target.value })}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </FieldGroup>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-negative/25 bg-negative/5 px-4 py-3 text-sm text-negative"
          >
            {error}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            {t('cancel')}
          </Button>
          {secondaryLabel ? (
            <Button
              type="button"
              variant="outline"
              disabled={!canSubmit}
              className="gap-2"
              onClick={() => handleSubmit('draft')}
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {secondaryLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={!canSubmit}
            className="gap-2"
            onClick={() => handleSubmit('submit')}
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {submitLabel}
          </Button>
        </div>
      </div>

      <TemplatePreview
        name={values.name || t('previewNameFallback')}
        headerType={values.headerType}
        headerContent={values.headerContent}
        bodyText={values.bodyText}
        footerText={values.footerText}
        buttons={values.buttons}
        sampleValues={values.sampleValues}
        className="xl:sticky xl:top-4"
      />
    </div>
  )
}
