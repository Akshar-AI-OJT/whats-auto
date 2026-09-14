import type { PaginationMeta, WhatsappMessageTemplate, WhatsappTemplateButton } from '@/lib/api'
import { unwrapPage, unwrapSingle } from '@/lib/api-unwrap'

export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const
/** Matches backend create validator — VIDEO is not accepted. */
export const TEMPLATE_HEADER_TYPES = ['NONE', 'TEXT', 'IMAGE', 'DOCUMENT'] as const
export const TEMPLATE_STATUS_TABS = ['all', 'draft', 'pending', 'approved', 'rejected'] as const
/** Meta message-template locales (WhatsApp Business Management API). */
export const TEMPLATE_LANGUAGES = [
  { value: 'af', label: 'Afrikaans' },
  { value: 'sq', label: 'Albanian' },
  { value: 'ar', label: 'Arabic' },
  { value: 'az', label: 'Azerbaijani' },
  { value: 'bn', label: 'Bengali' },
  { value: 'bg', label: 'Bulgarian' },
  { value: 'ca', label: 'Catalan' },
  { value: 'zh_CN', label: 'Chinese (CHN)' },
  { value: 'zh_HK', label: 'Chinese (HKG)' },
  { value: 'zh_TW', label: 'Chinese (TAI)' },
  { value: 'hr', label: 'Croatian' },
  { value: 'cs', label: 'Czech' },
  { value: 'da', label: 'Danish' },
  { value: 'nl', label: 'Dutch' },
  { value: 'en', label: 'English' },
  { value: 'en_GB', label: 'English (UK)' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'et', label: 'Estonian' },
  { value: 'fil', label: 'Filipino' },
  { value: 'fi', label: 'Finnish' },
  { value: 'fr', label: 'French' },
  { value: 'ka', label: 'Georgian' },
  { value: 'de', label: 'German' },
  { value: 'el', label: 'Greek' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'ha', label: 'Hausa' },
  { value: 'he', label: 'Hebrew' },
  { value: 'hi', label: 'Hindi' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'id', label: 'Indonesian' },
  { value: 'ga', label: 'Irish' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'kn', label: 'Kannada' },
  { value: 'kk', label: 'Kazakh' },
  { value: 'rw_RW', label: 'Kinyarwanda' },
  { value: 'ko', label: 'Korean' },
  { value: 'ky_KG', label: 'Kyrgyz' },
  { value: 'lo', label: 'Lao' },
  { value: 'lv', label: 'Latvian' },
  { value: 'lt', label: 'Lithuanian' },
  { value: 'mk', label: 'Macedonian' },
  { value: 'ms', label: 'Malay' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'mr', label: 'Marathi' },
  { value: 'nb', label: 'Norwegian' },
  { value: 'fa', label: 'Persian' },
  { value: 'pl', label: 'Polish' },
  { value: 'pt_BR', label: 'Portuguese (BR)' },
  { value: 'pt_PT', label: 'Portuguese (POR)' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'ro', label: 'Romanian' },
  { value: 'ru', label: 'Russian' },
  { value: 'sr', label: 'Serbian' },
  { value: 'sk', label: 'Slovak' },
  { value: 'sl', label: 'Slovenian' },
  { value: 'es', label: 'Spanish' },
  { value: 'es_AR', label: 'Spanish (ARG)' },
  { value: 'es_ES', label: 'Spanish (SPA)' },
  { value: 'es_MX', label: 'Spanish (MEX)' },
  { value: 'sw', label: 'Swahili' },
  { value: 'sv', label: 'Swedish' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'th', label: 'Thai' },
  { value: 'tr', label: 'Turkish' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'ur', label: 'Urdu' },
  { value: 'uz', label: 'Uzbek' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'zu', label: 'Zulu' },
] as const

export type TemplateStatusTab = (typeof TEMPLATE_STATUS_TABS)[number]
export type TemplateViewMode = 'cards' | 'list'

export function unwrapTemplateList(data: unknown): {
  items: WhatsappMessageTemplate[]
  meta: PaginationMeta | null
} {
  return unwrapPage<WhatsappMessageTemplate>(data)
}

export function unwrapTemplate(data: unknown): WhatsappMessageTemplate | null {
  return unwrapSingle<WhatsappMessageTemplate>(data)
}

export function isNumericTemplateVariable(key: string): boolean {
  return /^\d+$/.test(key)
}

/**
 * Extract unique template placeholders ({{1}} or {{name}}) across texts.
 * All-numeric lists are sorted numerically; otherwise appearance order is kept.
 */
export function extractTemplateVariables(...texts: Array<string | null | undefined>): string[] {
  const unique: string[] = []
  const seen = new Set<string>()
  for (const text of texts) {
    if (!text) continue
    for (const match of text.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*|\d+)\s*\}\}/g)) {
      const key = match[1]
      if (!key || seen.has(key)) continue
      seen.add(key)
      unique.push(key)
    }
  }
  const allNumeric = unique.length > 0 && unique.every(isNumericTemplateVariable)
  if (allNumeric) {
    return [...unique].sort((a, b) => Number(a) - Number(b))
  }
  return unique
}

/** Detect placeholder format across extracted names. */
export function detectTemplateVariableFormat(
  names: string[]
): 'named' | 'positional' | 'mixed' | null {
  if (names.length === 0) return null
  const allNumeric = names.every(isNumericTemplateVariable)
  const allNamed = names.every((n) => !isNumericTemplateVariable(n))
  if (allNumeric) return 'positional'
  if (allNamed) return 'named'
  return 'mixed'
}

/** Next {{n}} index for positional insert (max existing numeric + 1). */
export function nextPositionalVariableIndex(variables: string[]): number {
  const numeric = variables.filter(isNumericTemplateVariable).map(Number)
  if (numeric.length === 0) return 1
  return Math.max(...numeric) + 1
}

/** @deprecated Prefer extractTemplateVariables — kept for existing callers. */
export function extractBodyVariables(bodyText: string): string[] {
  return extractTemplateVariables(bodyText)
}

/** Build sampleValues payload from the form; skips blank entries. */
export function buildSampleValues(
  variables: string[],
  samples: Record<string, string>
): Record<string, string> {
  const sampleValues: Record<string, string> = {}
  for (const key of variables) {
    const value = String(samples[key] ?? '').trim()
    if (value) sampleValues[key] = value
  }
  return sampleValues
}

/** @deprecated Prefer buildSampleValues. */
export function buildNumericSampleValues(
  variables: string[],
  samples: Record<string, string>
): Record<string, string> {
  return buildSampleValues(variables, samples)
}

export function missingSampleVariables(
  variables: string[],
  samples: Record<string, string>
): string[] {
  return variables.filter((key) => !String(samples[key] ?? '').trim())
}

export function renderTemplatePreviewText(
  text: string | null | undefined,
  sampleValues?: Record<string, string>
): string {
  if (!text) return ''
  return text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*|\d+)\s*\}\}/g, (match, key: string) => {
    return sampleValues?.[key] || sampleValues?.[`{{${key}}}`] || match
  })
}

export function normalizeButtons(buttons: unknown): WhatsappTemplateButton[] {
  if (!buttons) return []
  if (Array.isArray(buttons)) return buttons as WhatsappTemplateButton[]
  return []
}

export function formatTemplateCategory(category: string) {
  const value = category.toUpperCase()
  if (value === 'MARKETING') return 'Marketing'
  if (value === 'UTILITY') return 'Utility'
  if (value === 'AUTHENTICATION') return 'Authentication'
  return category
}

export function formatTemplateLanguage(language: string | null | undefined) {
  if (!language) return '—'
  const known = TEMPLATE_LANGUAGES.find((item) => item.value === language)
  if (known) return `${known.label} (${known.value})`
  return language
}

export function formatHeaderType(headerType: string | null | undefined) {
  if (!headerType) return 'None'
  const value = headerType.toUpperCase()
  if (value === 'NONE' || value === '') return 'None'
  if (value === 'TEXT') return 'Text'
  if (value === 'IMAGE') return 'Image'
  if (value === 'DOCUMENT') return 'Document'
  return headerType
}

export function formatRelativeDate(value: string | null | undefined) {
  if (!value) return '—'
  try {
    const date = new Date(value)
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  } catch {
    return value
  }
}

export function truncatePreview(text: string | null | undefined, max = 90) {
  if (!text) return '—'
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}

export function categoryTone(category: string) {
  const value = category.toUpperCase()
  if (value === 'UTILITY') {
    return 'bg-dash-info-soft text-dash-info ring-1 ring-accent-cyan/30'
  }
  if (value === 'AUTHENTICATION') {
    return 'bg-warning/15 text-ink ring-1 ring-warning/30'
  }
  if (value === 'MARKETING') {
    return 'bg-primary-pale text-positive-deep ring-1 ring-primary/25'
  }
  return 'bg-dash-surface text-body ring-1 ring-dash-border'
}

export function statusTone(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'approved') {
    return 'bg-primary-pale text-positive-deep border-primary/25'
  }
  if (normalized === 'pending') {
    return 'bg-warning/15 text-ink border-warning/30'
  }
  if (normalized === 'draft') {
    return 'bg-dash-surface text-body border-dash-border'
  }
  if (normalized === 'rejected' || normalized === 'deleted') {
    return 'bg-negative/10 text-negative border-negative/25'
  }
  return 'bg-dash-surface text-body border-dash-border'
}

export function normalizeSampleValues(sampleValues: unknown): Record<string, string> {
  if (!sampleValues || typeof sampleValues !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(sampleValues as Record<string, unknown>)) {
    if (value == null) continue
    result[key] = String(value)
  }
  return result
}

export function buildSubmissionHistory(template: WhatsappMessageTemplate) {
  const events: Array<{ key: string; labelKey: string; at: string | null | undefined }> = [
    { key: 'created', labelKey: 'created', at: template.createdAt },
  ]

  if (template.lastSubmittedAt) {
    events.push({ key: 'submitted', labelKey: 'submitted', at: template.lastSubmittedAt })
  }

  const status = template.status.toLowerCase()
  if (status === 'approved') {
    events.push({
      key: 'approved',
      labelKey: 'approved',
      at: template.updatedAt ?? template.lastSubmittedAt,
    })
  } else if (status === 'rejected') {
    events.push({
      key: 'rejected',
      labelKey: 'rejected',
      at: template.updatedAt ?? template.lastSubmittedAt,
    })
  } else if (status === 'pending') {
    events.push({
      key: 'pending',
      labelKey: 'pendingReview',
      at: template.lastSubmittedAt ?? template.updatedAt,
    })
  }

  return events.filter((event) => Boolean(event.at))
}
