import type {
  PaginationMeta,
  WhatsappMessageTemplate,
  WhatsappTemplateButton,
} from '@/lib/api'

export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const
export const TEMPLATE_HEADER_TYPES = ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'] as const
export const TEMPLATE_STATUS_TABS = ['all', 'approved', 'pending', 'rejected'] as const
export const TEMPLATE_LANGUAGES = [
  { value: 'en_US', label: 'English (US)' },
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt_BR', label: 'Portuguese (BR)' },
] as const

export type TemplateStatusTab = (typeof TEMPLATE_STATUS_TABS)[number]

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

export function extractTemplateVariables(...texts: Array<string | null | undefined>): string[] {
  const unique = new Set<string>()
  for (const text of texts) {
    if (!text) continue
    for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) {
      unique.add(match[1]!)
    }
  }
  return [...unique].sort((a, b) => Number(a) - Number(b))
}

/** @deprecated Prefer extractTemplateVariables — kept for existing callers. */
export function extractBodyVariables(bodyText: string): string[] {
  return extractTemplateVariables(bodyText)
}

export function buildNumericSampleValues(
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
  return text.replace(/\{\{(\d+)\}\}/g, (_, key: string) => {
    return sampleValues?.[key] || sampleValues?.[`{{${key}}}`] || `Sample ${key}`
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

export function statusTone(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'approved') {
    return 'bg-primary-pale text-positive-deep border-primary/25'
  }
  if (normalized === 'pending' || normalized === 'draft') {
    return 'bg-warning/15 text-ink border-warning/30'
  }
  if (normalized === 'rejected' || normalized === 'deleted') {
    return 'bg-negative/10 text-negative border-negative/25'
  }
  return 'bg-dash-surface text-body border-dash-border'
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
