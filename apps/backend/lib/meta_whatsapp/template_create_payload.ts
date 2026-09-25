import type { MetaTemplateComponent, TemplateParameterSchema } from '#lib/meta_whatsapp/types'

const ANY_PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*|\d+)\s*\}\}/g

export type PreparedTemplateSubmission = {
  headerContent: string | null
  bodyText: string
  footerText: string | null
  buttons: Array<Record<string, unknown>> | null
  sampleValues: Record<string, string>
}

/**
 * Meta named parameters must be lowercase letters, digits, and underscores.
 * Catalog rows and the form can still carry `{{Name}}`; rewrite tokens and
 * sample keys before schema derivation and the Graph payload.
 */
export function prepareTemplateSubmission(params: {
  headerContent?: string | null
  bodyText: string
  footerText?: string | null
  buttons?: Array<Record<string, unknown>> | null
  sampleValues?: unknown
}): PreparedTemplateSubmission {
  const buttons = params.buttons
    ? params.buttons.map((button) => {
        const url = buttonUrlString(button)
        if (!url) return button
        return { ...button, url: lowercaseNamedPlaceholders(url) }
      })
    : null

  return {
    headerContent: params.headerContent ? lowercaseNamedPlaceholders(params.headerContent) : null,
    bodyText: lowercaseNamedPlaceholders(params.bodyText),
    footerText: params.footerText ?? null,
    buttons,
    sampleValues: lowercaseSampleKeys(sampleValueMap(params.sampleValues)),
  }
}

/**
 * Reasons Meta rejects a component create with `(#100) Invalid parameter`
 * before the request is even well-formed. Library creates skip this — the
 * library already owns the body.
 */
export function metaTemplateTextIssue(params: {
  headerType?: string | null
  headerContent?: string | null
  bodyText: string
  footerText?: string | null
}): string | null {
  const headerType = (params.headerType ?? 'none').toLowerCase()
  if (headerType === 'text' && params.headerContent && variableTouchesEdge(params.headerContent)) {
    return 'Header text cannot start or end with a variable. Add text before and after {{…}}.'
  }
  if (variableTouchesEdge(params.bodyText)) {
    return 'Body text cannot start or end with a variable. Add text before and after {{…}}.'
  }
  if (params.footerText && hasPlaceholder(params.footerText)) {
    return 'Footer text cannot contain variables.'
  }
  return null
}

export function buildMetaCreateComponents(params: {
  headerType?: string | null
  headerContent?: string | null
  bodyText: string
  footerText?: string | null
  buttons?: Array<Record<string, unknown>> | null
  sampleValues?: Record<string, string>
  parameterSchema: TemplateParameterSchema
  headerHandle: string | null
}): MetaTemplateComponent[] {
  const samples = params.sampleValues ?? {}
  const named = params.parameterSchema.parameterFormat === 'named'
  const metaComponents: MetaTemplateComponent[] = []

  if (params.headerType && params.headerType.toUpperCase() !== 'NONE') {
    const format = params.headerType.toUpperCase()
    if (format === 'TEXT' && params.headerContent) {
      const headerExample = textExample({
        names: params.parameterSchema.headerNames,
        samples,
        named,
        positionalKey: 'header_text',
        namedKey: 'header_text_named_params',
        positionalWrap: false,
      })
      metaComponents.push({
        type: 'HEADER',
        format: 'TEXT',
        text: params.headerContent,
        ...(headerExample ? { example: headerExample } : {}),
      })
    } else if ((format === 'IMAGE' || format === 'DOCUMENT') && params.headerHandle) {
      metaComponents.push({
        type: 'HEADER',
        format,
        example: { header_handle: [params.headerHandle] },
      })
    }
  }

  const bodyExample = textExample({
    names: params.parameterSchema.bodyNames,
    samples,
    named,
    positionalKey: 'body_text',
    namedKey: 'body_text_named_params',
    positionalWrap: true,
  })
  metaComponents.push({
    type: 'BODY',
    text: params.bodyText,
    ...(bodyExample ? { example: bodyExample } : {}),
  })

  if (params.footerText) {
    metaComponents.push({
      type: 'FOOTER',
      text: params.footerText,
    })
  }

  if (params.buttons && params.buttons.length > 0) {
    metaComponents.push({
      type: 'BUTTONS',
      buttons: metaCreateButtons(params.buttons, samples),
    })
  }

  return metaComponents
}

/**
 * Library creates do not take component examples. Button inputs must be
 * `{ type, url: { base_url, url_suffix_example } }` / `{ type, phone_number }`.
 * Body inputs are optional library flags (add_security_recommendation, …),
 * not sample values — sending samples is `(#100) Invalid parameter`.
 */
export function libraryTemplateButtonInputs(
  buttons: Array<Record<string, unknown>> | null | undefined,
  samples: Record<string, string>
): unknown[] | undefined {
  if (!buttons || buttons.length === 0) return undefined
  const inputs: unknown[] = []

  for (const button of buttons) {
    const type = String(button.type ?? '').toUpperCase()
    if (type === 'URL') {
      const baseUrl = buttonUrlString(button)
      if (!baseUrl) continue
      const url: Record<string, string> = { base_url: baseUrl }
      const example = urlSuffixExample(baseUrl, samples, button)
      if (example) url.url_suffix_example = example
      inputs.push({ type: 'URL', url })
    } else if (type === 'PHONE_NUMBER') {
      const phone = String(button.phone_number ?? button.phoneNumber ?? '').trim()
      if (!phone) continue
      inputs.push({ type: 'PHONE_NUMBER', phone_number: phone })
    }
  }

  return inputs.length > 0 ? inputs : undefined
}

function textExample(params: {
  names: string[]
  samples: Record<string, string>
  named: boolean
  positionalKey: string
  namedKey: string
  positionalWrap: boolean
}): Record<string, unknown> | null {
  if (params.names.length === 0) return null
  const values = params.names.map((name) => params.samples[name] ?? '')
  if (!values.every((value) => value.trim().length > 0)) return null

  if (params.named) {
    return {
      [params.namedKey]: params.names.map((name, index) => ({
        param_name: name,
        example: values[index],
      })),
    }
  }

  return {
    [params.positionalKey]: params.positionalWrap ? [values] : values,
  }
}

function metaCreateButtons(
  buttons: Array<Record<string, unknown>>,
  samples: Record<string, string>
): Array<Record<string, unknown>> {
  return buttons.map((button) => {
    const type = String(button.type ?? '').toUpperCase()
    if (type !== 'URL') return button

    const url = buttonUrlString(button)
    if (!url) return button
    const names = placeholderNames(url)
    if (names.length === 0) {
      const rest: Record<string, unknown> = { ...button, url }
      delete rest.example
      return rest
    }

    const values = names.map((name) => samples[name] ?? '').filter((value) => value.trim())
    if (values.length !== names.length) return { ...button, url }

    const resolved = values.map((value, index) => resolvedButtonExample(url, names[index], value))
    return { ...button, url, example: resolved }
  })
}

function resolvedButtonExample(url: string, name: string, sample: string): string {
  const trimmed = sample.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const token = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`)
  if (!token.test(url)) return trimmed
  return url.replace(token, trimmed)
}

function urlSuffixExample(
  baseUrl: string,
  samples: Record<string, string>,
  button: Record<string, unknown>
): string | undefined {
  const names = placeholderNames(baseUrl)
  if (names.length === 0) return undefined

  if (Array.isArray(button.example)) {
    const stored = button.example.find((item) => typeof item === 'string' && item.trim())
    if (typeof stored === 'string') {
      return resolvedButtonExample(baseUrl, names[0], stored)
    }
  }

  const values = names.map((name) => samples[name] ?? '').filter((value) => value.trim())
  if (values.length !== names.length) return undefined

  let resolved = baseUrl
  for (const [index, name] of names.entries()) {
    resolved = resolved.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`), values[index])
  }
  return /^https?:\/\//i.test(values[0]) ? values[0] : resolved
}

function buttonUrlString(button: Record<string, unknown>): string | null {
  const url = button.url
  if (typeof url === 'string' && url.trim()) return url.trim()
  if (url && typeof url === 'object' && !Array.isArray(url)) {
    const base = (url as Record<string, unknown>).base_url
    if (typeof base === 'string' && base.trim()) return base.trim()
  }
  return null
}

function placeholderNames(text: string): string[] {
  ANY_PLACEHOLDER.lastIndex = 0
  const names: string[] = []
  for (const match of text.matchAll(ANY_PLACEHOLDER)) {
    if (match[1]) names.push(match[1])
  }
  ANY_PLACEHOLDER.lastIndex = 0
  return names
}

function lowercaseNamedPlaceholders(text: string): string {
  ANY_PLACEHOLDER.lastIndex = 0
  const next = text.replace(ANY_PLACEHOLDER, (_raw, name: string) => {
    if (/^\d+$/.test(name)) return `{{${name}}}`
    return `{{${name.toLowerCase()}}}`
  })
  ANY_PLACEHOLDER.lastIndex = 0
  return next
}

function lowercaseSampleKeys(samples: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(samples)) {
    const nextKey = /^\d+$/.test(key) ? key : key.toLowerCase()
    if (!(nextKey in out)) out[nextKey] = value
  }
  return out
}

function sampleValueMap(sampleValues: unknown): Record<string, string> {
  if (!sampleValues || typeof sampleValues !== 'object' || Array.isArray(sampleValues)) {
    return {}
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(sampleValues as Record<string, unknown>)) {
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text) out[key] = text
  }
  return out
}

const PLACEHOLDER_TOKEN = String.raw`\{\{\s*(?:[a-zA-Z_][a-zA-Z0-9_]*|\d+)\s*\}\}`

function hasPlaceholder(text: string): boolean {
  return new RegExp(PLACEHOLDER_TOKEN).test(text)
}

function variableTouchesEdge(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  return (
    new RegExp(`^${PLACEHOLDER_TOKEN}`).test(trimmed) ||
    new RegExp(`${PLACEHOLDER_TOKEN}$`).test(trimmed)
  )
}
