import type {
  PaginationMeta,
  WhatsappMessageTemplate,
  WhatsappTemplateButton,
} from '@/lib/api'

export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const
/** Matches backend create validator — VIDEO is not accepted. */
export const TEMPLATE_HEADER_TYPES = ['NONE', 'TEXT', 'IMAGE', 'DOCUMENT'] as const
export const TEMPLATE_STATUS_TABS = [
  'all',
  'draft',
  'pending',
  'approved',
  'rejected',
] as const
export const TEMPLATE_LANGUAGES = [
  { value: 'en_US', label: 'English (US)' },
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt_BR', label: 'Portuguese (BR)' },
] as const

export type TemplateStatusTab = (typeof TEMPLATE_STATUS_TABS)[number]
export type TemplateViewMode = 'cards' | 'list'

export function unwrapTemplateList(data: unknown): {
  items: WhatsappMessageTemplate[]
  meta: PaginationMeta | null
} {
  if (!data) return { items: [], meta: null }
  if (Array.isArray(data)) return { items: data as WhatsappMessageTemplate[], meta: null }

  const root = data as {
    data?: WhatsappMessageTemplate[] | { data?: WhatsappMessageTemplate[]; meta?: PaginationMeta }
    meta?: PaginationMeta
  }

  if (Array.isArray(root.data)) {
    return { items: root.data, meta: root.meta ?? null }
  }

  if (root.data && typeof root.data === 'object' && Array.isArray(root.data.data)) {
    return {
      items: root.data.data,
      meta: root.data.meta ?? root.meta ?? null,
    }
  }

  return { items: [], meta: null }
}

export function unwrapTemplate(data: unknown): WhatsappMessageTemplate | null {
  if (!data) return null
  if (typeof data === 'object' && data !== null && 'id' in data && 'name' in data) {
    return data as WhatsappMessageTemplate
  }
  const wrapped = data as { data?: WhatsappMessageTemplate }
  return wrapped.data ?? null
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

export function normalizeSampleValues(
  sampleValues: unknown
): Record<string, string> {
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
