import type { MetaSendTemplateComponent, TemplateParameterSchema } from '#lib/meta_whatsapp/types'

const NAMED_PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g
const NUMBERED_PLACEHOLDER = /\{\{\s*\d+\s*\}\}/

export class TemplateParameterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateParameterError'
  }
}

function extractNamedPlaceholders(text: string | null | undefined): string[] {
  if (!text) return []
  const names: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(NAMED_PLACEHOLDER)) {
    const name = match[1]
    if (!seen.has(name)) {
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

function hasNumberedPlaceholders(text: string | null | undefined): boolean {
  if (!text) return false
  return NUMBERED_PLACEHOLDER.test(text)
}

function hasNamedPlaceholders(text: string): boolean {
  return /\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/.test(text)
}

function buttonsLookDynamic(buttons: unknown): boolean {
  if (!buttons) return false
  const raw = typeof buttons === 'string' ? buttons : JSON.stringify(buttons)
  return hasNumberedPlaceholders(raw) || hasNamedPlaceholders(raw)
}

/**
 * Derive the stored parameterSchema from local template fields.
 * Marks non-sendable when numbered vars, media headers, or dynamic buttons appear.
 */
export function deriveParameterSchema(params: {
  headerType?: string | null
  headerContent?: string | null
  bodyText: string
  buttons?: unknown
}): TemplateParameterSchema {
  const headerType = (params.headerType ?? 'none').toLowerCase()

  if (headerType === 'image' || headerType === 'video' || headerType === 'document') {
    return {
      headerNames: [],
      bodyNames: [],
      sendable: false,
      unsupportedReason: `Media header type "${headerType}" is not supported for outbound V1`,
    }
  }

  if (buttonsLookDynamic(params.buttons)) {
    return {
      headerNames: [],
      bodyNames: [],
      sendable: false,
      unsupportedReason:
        'Templates with dynamic button variables are not supported for outbound V1',
    }
  }

  if (hasNumberedPlaceholders(params.headerContent) || hasNumberedPlaceholders(params.bodyText)) {
    return {
      headerNames: [],
      bodyNames: [],
      sendable: false,
      unsupportedReason: 'Numbered placeholders like {{1}} are not supported; use named variables',
    }
  }

  const headerNames = headerType === 'text' ? extractNamedPlaceholders(params.headerContent) : []
  const bodyNames = extractNamedPlaceholders(params.bodyText)

  return {
    headerNames,
    bodyNames,
    sendable: true,
  }
}

function emptySchema(): TemplateParameterSchema {
  return { headerNames: [], bodyNames: [], sendable: false, unsupportedReason: 'Invalid schema' }
}

/**
 * Runtime-narrow a stored jsonb parameterSchema.
 */
export function parseParameterSchema(raw: unknown): TemplateParameterSchema {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptySchema()
  }
  const record = raw as Record<string, unknown>
  const headerNames = Array.isArray(record.headerNames)
    ? record.headerNames.filter((n): n is string => typeof n === 'string')
    : []
  const bodyNames = Array.isArray(record.bodyNames)
    ? record.bodyNames.filter((n): n is string => typeof n === 'string')
    : []
  const sendable = record.sendable === true
  const unsupportedReason =
    typeof record.unsupportedReason === 'string' ? record.unsupportedReason : undefined

  return { headerNames, bodyNames, sendable, unsupportedReason }
}

/**
 * Map named parameter values into Meta Cloud API template components (header/body).
 * Rejects missing, unexpected, or empty values with actionable errors.
 */
export function mapNamedParametersToMetaComponents(params: {
  schema: TemplateParameterSchema
  values: Record<string, string>
}): MetaSendTemplateComponent[] {
  const { schema, values } = params

  if (!schema.sendable) {
    throw new TemplateParameterError(
      schema.unsupportedReason ?? 'Template is not sendable with the current parameter schema'
    )
  }

  const required = [...schema.headerNames, ...schema.bodyNames]
  const requiredSet = new Set(required)
  const providedKeys = Object.keys(values)

  for (const key of providedKeys) {
    if (!requiredSet.has(key)) {
      throw new TemplateParameterError(`Unexpected template parameter "${key}"`)
    }
  }

  for (const name of required) {
    const value = values[name]
    if (value === undefined) {
      throw new TemplateParameterError(`Missing required template parameter "${name}"`)
    }
    if (typeof value !== 'string' || value.trim() === '') {
      throw new TemplateParameterError(`Template parameter "${name}" must be a non-empty string`)
    }
  }

  const components: MetaSendTemplateComponent[] = []

  if (schema.headerNames.length > 0) {
    components.push({
      type: 'header',
      parameters: schema.headerNames.map((name) => ({
        type: 'text' as const,
        parameter_name: name,
        text: values[name],
      })),
    })
  }

  if (schema.bodyNames.length > 0) {
    components.push({
      type: 'body',
      parameters: schema.bodyNames.map((name) => ({
        type: 'text' as const,
        parameter_name: name,
        text: values[name],
      })),
    })
  }

  return components
}

/**
 * Pick only the schema-required parameter values.
 * Extra candidate keys are ignored (unlike mapNamedParametersToMetaComponents).
 * Missing or empty required values throw TemplateParameterError.
 */
export function pickRequiredParameterValues(params: {
  schema: TemplateParameterSchema
  values: Record<string, string>
}): Record<string, string> {
  const { schema, values } = params

  if (!schema.sendable) {
    throw new TemplateParameterError(
      schema.unsupportedReason ?? 'Template is not sendable with the current parameter schema'
    )
  }

  const required = [...schema.headerNames, ...schema.bodyNames]
  const picked: Record<string, string> = {}

  for (const name of required) {
    const value = values[name]
    if (value === undefined) {
      throw new TemplateParameterError(`Missing required template parameter "${name}"`)
    }
    if (typeof value !== 'string' || value.trim() === '') {
      throw new TemplateParameterError(`Template parameter "${name}" must be a non-empty string`)
    }
    picked[name] = value
  }

  return picked
}
