import type {
  CampaignVariableMapping,
  CampaignVariableMappings,
  WhatsappMessageTemplate,
} from '@/lib/api'

/** Contact columns supported by backend `readMappedContactField`. */
export const CAMPAIGN_CONTACT_MAPPING_FIELDS = [
  'name',
  'first_name',
  'customer_name',
  'email',
  'company',
  'phone',
] as const

export type CampaignContactMappingField = (typeof CAMPAIGN_CONTACT_MAPPING_FIELDS)[number]

export type CampaignVariableMappingSource = CampaignVariableMapping['source']

/** Form draft — empty source means the variable is still unmapped. */
export type CampaignVariableMappingDraft = {
  source: CampaignVariableMappingSource | ''
  field: string
  value: string
}

export type CampaignVariableMappingDrafts = Record<string, CampaignVariableMappingDraft>

export const emptyMappingDraft = (): CampaignVariableMappingDraft => ({
  source: '',
  field: '',
  value: '',
})

/**
 * Template variables that must be mapped before send/schedule.
 * Sources: headerNames + bodyNames + urlButtons[].name from parameterSchema.
 */
export function extractTemplateVariableNames(
  template: WhatsappMessageTemplate | null | undefined
): string[] {
  const schema = template?.parameterSchema
  if (!schema) return []

  const names: string[] = []
  const seen = new Set<string>()

  const push = (raw: unknown) => {
    if (typeof raw !== 'string') return
    const name = raw.trim()
    if (!name || seen.has(name)) return
    seen.add(name)
    names.push(name)
  }

  for (const list of [schema.headerNames, schema.bodyNames]) {
    if (!Array.isArray(list)) continue
    for (const raw of list) push(raw)
  }

  if (Array.isArray(schema.urlButtons)) {
    for (const button of schema.urlButtons) {
      if (!button || typeof button !== 'object') continue
      push((button as { name?: unknown }).name)
    }
  }

  return names
}

export function isTemplateSendable(template: WhatsappMessageTemplate | null | undefined): boolean {
  if (!template?.parameterSchema) return true
  return template.parameterSchema.sendable !== false
}

export function templateUnsupportedReason(
  template: WhatsappMessageTemplate | null | undefined
): string | null {
  if (!template?.parameterSchema || template.parameterSchema.sendable !== false) return null
  const reason = template.parameterSchema.unsupportedReason
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null
}

export function mappingFromApi(mapping: unknown): CampaignVariableMappingDraft {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    return emptyMappingDraft()
  }

  const row = mapping as Record<string, unknown>
  const source = row.source

  if (source === 'contact_field' || source === 'custom_field') {
    const field = typeof row.field === 'string' ? row.field.trim() : ''
    return { source, field, value: '' }
  }

  if (source === 'static') {
    const value = typeof row.value === 'string' ? row.value : ''
    return { source: 'static', field: '', value }
  }

  return emptyMappingDraft()
}

export function draftsFromApiMappings(
  mappings: CampaignVariableMappings | null | undefined
): CampaignVariableMappingDrafts {
  if (!mappings || typeof mappings !== 'object') return {}
  const out: CampaignVariableMappingDrafts = {}
  for (const [key, value] of Object.entries(mappings)) {
    out[key] = mappingFromApi(value)
  }
  return out
}

/**
 * Keep drafts for variables that still exist; drop removed vars; leave new vars unmapped.
 */
export function reconcileMappingDrafts(
  previous: CampaignVariableMappingDrafts,
  variableNames: string[]
): CampaignVariableMappingDrafts {
  const next: CampaignVariableMappingDrafts = {}
  for (const name of variableNames) {
    next[name] = previous[name] ? { ...previous[name] } : emptyMappingDraft()
  }
  return next
}

export function isMappingDraftComplete(draft: CampaignVariableMappingDraft | undefined): boolean {
  if (!draft || !draft.source) return false
  if (draft.source === 'contact_field') {
    return (
      Boolean(draft.field.trim()) &&
      (CAMPAIGN_CONTACT_MAPPING_FIELDS as readonly string[]).includes(draft.field.trim())
    )
  }
  if (draft.source === 'custom_field') {
    return draft.field.trim().length > 0
  }
  if (draft.source === 'static') {
    return draft.value.trim().length > 0
  }
  return false
}

export function draftToApiMapping(
  draft: CampaignVariableMappingDraft
): CampaignVariableMapping | null {
  if (!isMappingDraftComplete(draft) || !draft.source) return null

  if (draft.source === 'contact_field') {
    return { source: 'contact_field', field: draft.field.trim() }
  }
  if (draft.source === 'custom_field') {
    return { source: 'custom_field', field: draft.field.trim() }
  }
  return { source: 'static', value: draft.value.trim() }
}

/** Build API payload — only complete entries; never empty static values. */
export function buildVariableMappingsPayload(
  drafts: CampaignVariableMappingDrafts,
  variableNames: string[]
): CampaignVariableMappings {
  const out: CampaignVariableMappings = {}
  for (const name of variableNames) {
    const mapped = draftToApiMapping(drafts[name] ?? emptyMappingDraft())
    if (mapped) out[name] = mapped
  }
  return out
}

export function listUnmappedVariableNames(
  drafts: CampaignVariableMappingDrafts,
  variableNames: string[]
): string[] {
  return variableNames.filter((name) => !isMappingDraftComplete(drafts[name]))
}
