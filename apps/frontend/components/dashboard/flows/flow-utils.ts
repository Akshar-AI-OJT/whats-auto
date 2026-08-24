import type {
  ConversationFlow,
  ConversationFlowStatus,
  ConversationFlowValidateResult,
  ConversationFlowValidationError,
  PaginationMeta,
} from '@/lib/api'

export type FlowStatusFilter = 'all' | ConversationFlowStatus

export function unwrapFlowList(data: unknown): {
  items: ConversationFlow[]
  meta: PaginationMeta | null
} {
  if (!data) return { items: [], meta: null }
  if (Array.isArray(data)) return { items: data as ConversationFlow[], meta: null }

  const root = data as {
    data?: ConversationFlow[] | { data?: ConversationFlow[]; meta?: PaginationMeta }
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

export function unwrapFlow(data: unknown): ConversationFlow | null {
  if (!data || typeof data !== 'object') return null
  const root = data as { data?: ConversationFlow } & Partial<ConversationFlow>
  if (root.data && typeof root.data === 'object' && typeof root.data.id === 'string') {
    return root.data
  }
  if (typeof root.id === 'string') return root as ConversationFlow
  return null
}

export function unwrapFlowValidate(data: unknown): ConversationFlowValidateResult {
  const empty: ConversationFlowValidateResult = { valid: false, errors: [] }
  if (!data || typeof data !== 'object') return empty
  const root = data as {
    data?: ConversationFlowValidateResult
    valid?: boolean
    errors?: ConversationFlowValidationError[]
  }
  const payload = root.data ?? root
  return {
    valid: payload.valid === true,
    errors: Array.isArray(payload.errors) ? payload.errors : [],
  }
}

export function parseKeywordList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function formatFlowDate(iso: string, locale?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function flowStatusBadgeClass(status: string): string {
  switch (status) {
    case 'PUBLISHED':
      return 'bg-primary-pale text-positive-deep ring-1 ring-primary/25'
    case 'ARCHIVED':
      return 'bg-dash-surface text-mute ring-1 ring-dash-border'
    case 'DRAFT':
    default:
      return 'bg-dash-info-soft text-dash-info ring-1 ring-accent-cyan/30'
  }
}
