import type {
  CampaignVariableMapping,
  CampaignVariableMappings,
  WhatsappMessageTemplate,
} from '@/lib/api'
import { extractTemplateVariables, isNumericTemplateVariable } from '../templates/template-utils'

/** Contact columns supported by backend `readMappedContactField`. */
export const CAMPAIGN_CONTACT_MAPPING_FIELDS = [
  'name',
  'first_name',
  'last_name',
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

function urlButtonTexts(template: WhatsappMessageTemplate | null | undefined): string[] {
  const buttons = template?.buttons
  if (!Array.isArray(buttons)) return []
  return buttons
    .filter((button) => String(button?.type || '').toUpperCase() === 'URL')
    .map((button) => String(button?.url || ''))
}

/**
 * Variables extracted from template body/header/URL buttons when schema is empty or stale.
 */
export function extractTemplateVariableNamesFromText(
  template: WhatsappMessageTemplate | null | undefined
): string[] {
  if (!template) return []
  const headerText =
    String(template.headerType || '').toUpperCase() === 'TEXT' ? template.headerContent : ''
  return extractTemplateVariables(template.bodyText, headerText, ...urlButtonTexts(template))
}

/**
 * Template variables that must be mapped before send/schedule.
 * Prefer parameterSchema names; fall back to body/header/URL text when schema is stale.
 */
export function extractTemplateVariableNames(
  template: WhatsappMessageTemplate | null | undefined
): string[] {
  const schema = template?.parameterSchema
  if (schema) {
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

    if (names.length > 0) return names
  }

  return extractTemplateVariableNamesFromText(template)
}

/**
 * Whether the campaign UI can map & launch this template.
 * Heals stale `sendable: false` from numbered-placeholder schemas by re-checking text.
 */
export function isTemplateSendable(template: WhatsappMessageTemplate | null | undefined): boolean {
  if (!template?.parameterSchema) return true
  if (template.parameterSchema.sendable !== false) return true

  const headerType = String(template.headerType || '').toLowerCase()
  if (headerType === 'video') return false

  const reason = String(template.parameterSchema.unsupportedReason || '')
  if (/mixed numbered and named/i.test(reason)) return false

  const fromText = extractTemplateVariableNamesFromText(template)
  const hasMixed =
    fromText.some(isNumericTemplateVariable) &&
    fromText.some((n) => !isNumericTemplateVariable(n))
  if (hasMixed) return false

  // Stale non-sendable (e.g. old "Numbered placeholders are not supported") → allow mapping.
  return true
}

export function templateUnsupportedReason(
  template: WhatsappMessageTemplate | null | undefined
): string | null {
  if (!template?.parameterSchema || isTemplateSendable(template)) return null
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

/**
 * Sample values for live template preview while mapping.
 * Mapped slots show static text, `[Contact field]`, or `[custom_key]`;
 * unmapped slots fall back to template samples so the bubble stays readable.
 */
export function buildCampaignPreviewSampleValues(params: {
  variableNames: string[]
  drafts: CampaignVariableMappingDrafts
  templateSamples?: Record<string, string> | null
  contactFieldLabels: Record<string, string>
}): Record<string, string> {
  const out: Record<string, string> = { ...(params.templateSamples ?? {}) }

  for (const name of params.variableNames) {
    const draft = params.drafts[name]
    if (!isMappingDraftComplete(draft) || !draft?.source) continue

    if (draft.source === 'static') {
      out[name] = draft.value.trim()
      continue
    }

    if (draft.source === 'contact_field') {
      const field = draft.field.trim()
      const label = params.contactFieldLabels[field] ?? field
      out[name] = `[${label}]`
      continue
    }

    if (draft.source === 'custom_field') {
      out[name] = `[${draft.field.trim()}]`
    }
  }

  return out
}
