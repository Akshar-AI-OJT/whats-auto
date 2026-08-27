'use client'

import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Download, Loader2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  api,
  type ApiError,
  type ContactImportResult,
} from '@/lib/api'
import {
  CONTACT_CSV_FIELDS,
  CONTACT_CSV_MAX_BYTES,
  ContactCsvParseError,
  escapeCsvCell,
  hasDuplicateFieldMapping,
  isCsvFile,
  mappedFieldsList,
  parseContactCsvText,
  suggestColumnMapping,
  toBackendColumnMapping,
  type ContactCsvField,
  type ParsedContactCsv,
} from '@/lib/contact-csv'
import { isInternationalContactPhone } from '@/lib/contact-phone'
import { COUNTRY_OPTIONS } from '@/components/onboarding/organization-wizard-types'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ImportContactsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}

type WizardStep = 1 | 2 | 3 | 4
type Screen = WizardStep | 'result'

const SELECT_CLASS = cn(
  'h-12 w-full cursor-pointer appearance-none rounded-md border border-ink bg-canvas px-4 text-base leading-5 text-ink outline-none',
  'hover:border-body focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-primary/50',
  'disabled:cursor-not-allowed disabled:border-border disabled:bg-canvas-soft disabled:text-mute'
)

function unwrapImport(
  data: ({ data?: ContactImportResult } & ContactImportResult) | undefined
): ContactImportResult | null {
  if (!data) return null
  if (data.data && typeof data.data === 'object' && 'totalRows' in data.data) {
    return data.data
  }
  if ('totalRows' in data) return data
  return null
}

function hasNationalMappedPhones(
  parsed: ParsedContactCsv | null,
  phoneHeader: string | undefined
) {
  if (!parsed || !phoneHeader) return false
  return parsed.rows.some((row) => {
    const phone = (row[phoneHeader] ?? '').trim()
    return phone.length > 0 && !isInternationalContactPhone(phone)
  })
}

function skippedCount(result: ContactImportResult) {
  if (Array.isArray(result.rows) && result.rows.length > 0) {
    return result.rows.filter((row) => row.status === 'skipped').length
  }
  return Math.max(0, result.totalRows - result.successCount - result.errorCount)
}

function buildReportCsv(result: ContactImportResult) {
  const extraHeaders: string[] = []
  const seen = new Set<string>()
  for (const row of result.rows ?? []) {
    for (const key of Object.keys(row.rawData ?? {})) {
      if (!seen.has(key)) {
        seen.add(key)
        extraHeaders.push(key)
      }
    }
  }

  const headers = ['rowNumber', 'status', 'action', 'errorMessage', ...extraHeaders]
  const lines = [headers.map(escapeCsvCell).join(',')]

  for (const row of result.rows ?? []) {
    const cells = [
      String(row.rowNumber),
      row.status,
      row.action ?? '',
      row.errorMessage ?? '',
      ...extraHeaders.map((header) => row.rawData?.[header] ?? ''),
    ]
    lines.push(cells.map(escapeCsvCell).join(','))
  }

  return lines.join('\n')
}

export function ImportContactsDialog({
  open,
  onOpenChange,
  onImported,
}: ImportContactsDialogProps) {
  const t = useTranslations('dashboard.contacts.import')
  const tCountries = useTranslations('onboarding.organization.step2.countries')
  const { canImportContacts, isLoading: orgsLoading } = useOrganizations()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileId = useId()
  const countryId = useId()
  const duplicatesId = useId()
  const formErrorId = useId()

  const [screen, setScreen] = useState<Screen>(1)
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedContactCsv | null>(null)
  const [csvToField, setCsvToField] = useState<Record<string, ContactCsvField | ''>>({})
  const [defaultCountryCode, setDefaultCountryCode] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<ContactImportResult | null>(null)

  const step: WizardStep = screen === 'result' ? 4 : screen
  const mapping = toBackendColumnMapping(csvToField)
  const mappedFields = mappedFieldsList(csvToField)
  const previewRows = parsed?.rows.slice(0, 3) ?? []
  const needsCountryWarning =
    !defaultCountryCode && hasNationalMappedPhones(parsed, mapping.phone)

  function reset() {
    setScreen(1)
    setFile(null)
    setParsed(null)
    setCsvToField({})
    setDefaultCountryCode('')
    setShowPreview(false)
    setDragActive(false)
    setError(null)
    setPending(false)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function mapParseError(code: ContactCsvParseError['code']) {
    if (code === 'empty') return t('errors.empty')
    if (code === 'malformed') return t('errors.malformed')
    if (code === 'noHeaders') return t('errors.noHeaders')
    return t('errors.tooManyRows')
  }

  function mapImportError(apiError: ApiError): string {
    if (apiError.status === 401) return t('errors.sessionExpired')
    if (apiError.status === 403 || apiError.code === 'PERMISSION_DENIED') {
      return t('errors.permissionDenied')
    }
    if (apiError.code === 'E_CONTACT_IMPORT_MISSING_PHONE_COLUMN') {
      return t('errors.missingPhoneColumn')
    }
    if (apiError.code === 'E_CONTACT_IMPORT_INVALID_COUNTRY') {
      return t('errors.invalidCountry')
    }
    if (apiError.code === 'E_CONTACT_IMPORT_TOO_MANY_ROWS') {
      return t('errors.tooManyRows')
    }
    if (apiError.code === 'E_CONTACT_IMPORT_EMPTY') return t('errors.empty')
    if (apiError.code === 'E_CONTACT_IMPORT_MALFORMED') return t('errors.malformed')
    if (apiError.code === 'E_CONTACT_IMPORT_INVALID_FILE') return t('errors.invalidFile')
    return apiError.message || t('errors.generic')
  }

  async function applyFile(nextFile: File) {
    setError(null)
    setResult(null)
    setShowPreview(false)

    if (!isCsvFile(nextFile)) {
      setFile(null)
      setParsed(null)
      setCsvToField({})
      setError(t('errors.invalidType'))
      return
    }

    if (nextFile.size > CONTACT_CSV_MAX_BYTES) {
      setFile(null)
      setParsed(null)
      setCsvToField({})
      setError(t('errors.tooLarge'))
      return
    }

    try {
      const text = await nextFile.text()
      const nextParsed = parseContactCsvText(text)
      setFile(nextFile)
      setParsed(nextParsed)
      setCsvToField(suggestColumnMapping(nextParsed.headers))
      setScreen(1)
    } catch (err) {
      setFile(null)
      setParsed(null)
      setCsvToField({})
      if (err instanceof ContactCsvParseError) {
        setError(mapParseError(err.code))
        return
      }
      setError(t('errors.malformed'))
    }
  }

  function handleNext() {
    setError(null)
    if (screen === 1) {
      if (!file || !parsed) {
        setError(t('errors.invalidFile'))
        return
      }
      setScreen(2)
      return
    }
    if (screen === 2) {
      if (!mapping.phone) {
        setError(t('map.phoneRequired'))
        return
      }
      if (hasDuplicateFieldMapping(csvToField)) {
        setError(t('map.duplicateField'))
        return
      }
      setScreen(3)
      return
    }
    if (screen === 3) {
      setScreen(4)
    }
  }

  async function handleImport() {
    if (!file || pending) return
    if (!canImportContacts) {
      setError(t('errors.permissionDenied'))
      return
    }
    if (!mapping.phone) {
      setError(t('map.phoneRequired'))
      return
    }

    setPending(true)
    setError(null)
    try {
      const { data } = await api.contacts.importCsv({
        file,
        columnMapping: mapping,
        defaultCountryCode: defaultCountryCode || undefined,
      })
      const imported = unwrapImport(data)
      if (!imported) {
        setError(t('errors.generic'))
        return
      }
      setResult(imported)
      setScreen('result')
      try {
        onImported?.()
      } catch {
        // Import already succeeded; list refresh is best-effort.
      }
    } catch (err) {
      setError(mapImportError(err as ApiError))
    } finally {
      setPending(false)
    }
  }

  function handleDownloadReport() {
    if (!result?.rows?.length) return
    const csv = buildReportCsv(result)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'contact-import-report.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const selectedCountry = COUNTRY_OPTIONS.find((country) => country.code === defaultCountryCode)
  const countryLabel = selectedCountry
    ? tCountries(selectedCountry.labelKey)
    : t('review.defaultCountryNone')

  const steps: { id: WizardStep; label: string }[] = [
    { id: 1, label: t('steps.upload') },
    { id: 2, label: t('steps.map') },
    { id: 3, label: t('steps.settings') },
    { id: 4, label: t('steps.review') },
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent
        className="max-h-[min(90vh,46rem)] gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={!pending}
      >
        <DialogHeader className="border-b border-dash-border px-5 py-4 text-left sm:px-6">
          <DialogTitle className="font-display text-lg text-ink">{t('title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('upload.hint')}</DialogDescription>
          {screen !== 'result' ? (
            <ol className="mt-4 flex items-start gap-0" aria-label={t('title')}>
              {steps.map((item, index) => {
                const done = step > item.id
                const active = step === item.id
                const isLast = index === steps.length - 1
                return (
                  <li
                    key={item.id}
                    className={cn('flex min-w-0', isLast ? 'flex-none' : 'flex-1')}
                  >
                    <div className="flex min-w-0 flex-col items-center gap-1.5">
                      <span
                        className={cn(
                          'flex size-7 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
                          (done || active) && 'bg-primary text-on-primary',
                          active && 'ring-4 ring-primary/20',
                          !done && !active && 'border border-dash-border bg-canvas text-mute'
                        )}
                        aria-current={active ? 'step' : undefined}
                      >
                        {done ? <Check className="size-3.5" aria-hidden /> : item.id}
                      </span>
                      <span
                        className={cn(
                          'max-w-[4.5rem] text-center text-[10px] leading-4 font-medium sm:max-w-none sm:text-xs',
                          active || done ? 'text-ink' : 'text-mute'
                        )}
                      >
                        {item.label}
                      </span>
                    </div>
                    {!isLast ? (
                      <div
                        className="mt-3.5 h-px min-w-[0.5rem] flex-1 bg-dash-border sm:mx-2"
                        aria-hidden
                      >
                        <div
                          className={cn(
                            'h-full bg-primary transition-[width] duration-300',
                            done ? 'w-full' : 'w-0'
                          )}
                        />
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          ) : null}
        </DialogHeader>

        <div
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5 sm:px-6"
          aria-busy={pending}
          aria-describedby={error ? formErrorId : undefined}
        >
          {screen === 1 ? (
            <div className="flex flex-col gap-4">
              <label
                htmlFor={fileId}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-4 py-10 text-center transition-colors',
                  dragActive
                    ? 'border-primary bg-primary-pale/40'
                    : 'border-dash-border bg-dash-surface/50 hover:border-body'
                )}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setDragActive(true)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragActive(true)
                }}
                onDragLeave={(event) => {
                  event.preventDefault()
                  setDragActive(false)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragActive(false)
                  const dropped = event.dataTransfer.files?.[0]
                  if (dropped) void applyFile(dropped)
                }}
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-pale text-positive-deep">
                  <Upload className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-medium text-ink">{t('upload.heading')}</p>
                  <p className="mt-1 text-sm text-body">{t('upload.hint')}</p>
                  <p className="mt-1 text-xs text-mute">{t('upload.supports')}</p>
                </div>
                {file ? (
                  <p className="max-w-full truncate text-sm font-medium text-positive-deep">
                    {t('upload.selected', { name: file.name })}
                  </p>
                ) : null}
                <input
                  ref={fileInputRef}
                  id={fileId}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  disabled={pending}
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0]
                    if (nextFile) void applyFile(nextFile)
                  }}
                />
              </label>
              <div className="rounded-xl border border-primary/30 bg-primary-pale/50 px-3 py-2 text-sm text-positive-deep">
                {t('upload.supportedFields')}
              </div>
            </div>
          ) : null}

          {screen === 2 && parsed ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-medium text-ink">{t('map.heading')}</p>
              <div className="hidden grid-cols-2 gap-3 text-xs font-medium tracking-wide text-mute uppercase sm:grid">
                <span>{t('map.csvColumn')}</span>
                <span>{t('map.contactField')}</span>
              </div>
              <div className="flex flex-col gap-3">
                {parsed.headers.map((header) => (
                  <div
                    key={header}
                    className="grid gap-1.5 sm:grid-cols-2 sm:items-center sm:gap-3"
                  >
                    <div className="flex h-12 items-center truncate rounded-md border border-dash-border bg-canvas-soft px-4 text-sm font-medium text-ink">
                      {header}
                    </div>
                    <label className="sr-only" htmlFor={`${fileId}-${header}`}>
                      {t('map.contactField')}
                    </label>
                    <select
                      id={`${fileId}-${header}`}
                      value={csvToField[header] ?? ''}
                      className={cn(SELECT_CLASS, !(csvToField[header] ?? '') && 'text-mute')}
                      disabled={pending}
                      onChange={(event) => {
                        const value = event.target.value as ContactCsvField | ''
                        setCsvToField((prev) => ({ ...prev, [header]: value }))
                        setError(null)
                      }}
                    >
                      <option value="">{t('map.unmapped')}</option>
                      {CONTACT_CSV_FIELDS.map((field) => (
                        <option key={field} value={field}>
                          {t(`map.fields.${field}`)}
                          {field === 'phone' ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="self-start text-sm font-medium text-positive-deep hover:underline"
                onClick={() => setShowPreview((prev) => !prev)}
              >
                {showPreview ? t('map.previewHide') : t('map.previewToggle')}
              </button>
              {showPreview ? (
                <div className="overflow-x-auto rounded-xl border border-dash-border">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-canvas-soft text-mute">
                      <tr>
                        {parsed.headers.map((header) => (
                          <th key={header} className="px-3 py-2 font-medium whitespace-nowrap">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, index) => (
                        <tr key={index} className="border-t border-dash-border text-ink">
                          {parsed.headers.map((header) => (
                            <td key={header} className="max-w-[10rem] truncate px-3 py-2">
                              {row[header] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          {screen === 3 ? (
            <FieldGroup className="gap-5">
              <Field className="gap-2">
                <FieldLabel htmlFor={countryId}>{t('settings.country')}</FieldLabel>
                <select
                  id={countryId}
                  value={defaultCountryCode}
                  disabled={pending}
                  className={cn(SELECT_CLASS, !defaultCountryCode && 'text-mute')}
                  onChange={(event) => setDefaultCountryCode(event.target.value)}
                >
                  <option value="">{t('settings.countryPlaceholder')}</option>
                  {COUNTRY_OPTIONS.map((country) => (
                    <option key={country.code} value={country.code}>
                      {tCountries(country.labelKey)}
                    </option>
                  ))}
                </select>
                <FieldDescription>{t('settings.countryHint')}</FieldDescription>
                {needsCountryWarning ? (
                  <div
                    role="status"
                    className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-ink"
                  >
                    {t('settings.countryNationalWarning')}
                  </div>
                ) : null}
              </Field>
              <Field className="gap-2">
                <FieldLabel htmlFor={duplicatesId}>{t('settings.duplicates')}</FieldLabel>
                <select
                  id={duplicatesId}
                  value="skip"
                  disabled
                  className={SELECT_CLASS}
                >
                  <option value="skip">{t('settings.duplicatesValue')}</option>
                </select>
                <FieldDescription>{t('settings.duplicatesHint')}</FieldDescription>
              </Field>
            </FieldGroup>
          ) : null}

          {screen === 4 ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-medium text-ink">{t('review.heading')}</p>
              <dl className="divide-y divide-dash-border overflow-hidden rounded-2xl border border-dash-border">
                <ReviewRow label={t('review.file')} value={file?.name ?? ''} />
                <ReviewRow
                  label={t('review.totalRows')}
                  value={String(parsed?.totalRows ?? 0)}
                />
                <ReviewRow
                  label={t('review.mappedFields')}
                  value={mappedFields.map((field) => t(`map.fields.${field}`)).join(', ')}
                />
                <ReviewRow label={t('review.defaultCountry')} value={countryLabel} />
                <ReviewRow
                  label={t('review.duplicates')}
                  value={t('review.duplicatesValue')}
                />
              </dl>
              <div className="rounded-xl border border-primary/30 bg-primary-pale/50 px-3 py-2 text-sm text-positive-deep">
                {t('review.warning')}
              </div>
              {needsCountryWarning ? (
                <div
                  role="status"
                  className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-ink"
                >
                  {t('review.countryNationalWarning')}
                </div>
              ) : null}
            </div>
          ) : null}

          {screen === 'result' && result ? (
            <ImportResultView result={result} skipped={skippedCount(result)} />
          ) : null}

          {error ? (
            <div
              id={formErrorId}
              role="alert"
              className="rounded-xl border border-negative/25 bg-negative/5 px-3 py-2 text-sm text-negative"
            >
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 border-t border-dash-border sm:flex-row sm:justify-end">
          {screen === 'result' ? (
            <>
              {result?.rows?.length ? (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={handleDownloadReport}
                >
                  <Download className="size-4" aria-hidden />
                  {t('result.downloadReport')}
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={() => {
                  reset()
                  onOpenChange(false)
                }}
              >
                {t('close')}
              </Button>
            </>
          ) : (
            <>
              {screen === 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    reset()
                    onOpenChange(false)
                  }}
                >
                  {t('cancel')}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setError(null)
                    setScreen((prev) => (prev === 'result' ? 4 : ((prev - 1) as WizardStep)))
                  }}
                >
                  {t('back')}
                </Button>
              )}
              {screen === 4 ? (
                <Button
                  type="button"
                  disabled={pending || orgsLoading || !canImportContacts || !file}
                  className="gap-2"
                  onClick={() => {
                    void handleImport()
                  }}
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      {t('importing')}
                    </>
                  ) : (
                    t('import')
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={pending || (screen === 1 && (!file || !parsed))}
                  onClick={handleNext}
                >
                  {t('next')}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 bg-canvas px-4 py-3">
      <dt className="text-sm text-body">{label}</dt>
      <dd className="max-w-[60%] text-right text-sm font-medium text-ink">{value}</dd>
    </div>
  )
}

function ImportResultView({
  result,
  skipped,
}: {
  result: ContactImportResult
  skipped: number
}) {
  const t = useTranslations('dashboard.contacts.import')
  return (
    <div className="flex flex-col items-center gap-5 py-2 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-primary text-on-primary">
        <Check className="size-8" aria-hidden />
      </span>
      <div>
        <p className="font-display text-xl text-ink">{t('result.title')}</p>
        <p className="mt-1 text-sm text-body">{t('result.subtitle')}</p>
      </div>
      <dl className="w-full divide-y divide-dash-border overflow-hidden rounded-2xl border border-dash-border text-left">
        <ReviewRow label={t('result.totalRows')} value={String(result.totalRows)} />
        <div className="flex items-start justify-between gap-4 bg-canvas px-4 py-3">
          <dt className="text-sm text-body">{t('result.imported')}</dt>
          <dd className="text-sm font-medium text-positive-deep">{result.successCount}</dd>
        </div>
        <div className="flex items-start justify-between gap-4 bg-canvas px-4 py-3">
          <dt className="text-sm text-body">{t('result.skipped')}</dt>
          <dd className="text-sm font-medium text-warning-deep">{skipped}</dd>
        </div>
        <div className="flex items-start justify-between gap-4 bg-canvas px-4 py-3">
          <dt className="text-sm text-body">{t('result.failed')}</dt>
          <dd className="text-sm font-medium text-negative">{result.errorCount}</dd>
        </div>
      </dl>
    </div>
  )
}
