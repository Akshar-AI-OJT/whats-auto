import logger from '@adonisjs/core/services/logger'

export type FlowInterpolationContext = {
  contact?: {
    name?: string | null
    phone?: string | null
  }
  variables?: Record<string, unknown>
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g

/**
 * Resolves `{{contact.name}}` / `{{variables.x}}` (and dotted paths under those roots).
 * Unresolved keys become empty string and log a warning.
 */
export function interpolateFlowText(
  template: string,
  context: FlowInterpolationContext,
  logContext?: Record<string, unknown>
): string {
  return template.replace(PLACEHOLDER, (_match, rawPath: string) => {
    const value = resolvePath(rawPath, context)
    if (value === undefined || value === null) {
      logger.warn({ ...logContext, path: rawPath }, 'flow.variable.unresolved')
      return ''
    }
    return String(value)
  })
}

function resolvePath(path: string, context: FlowInterpolationContext): unknown {
  const parts = path.split('.').filter(Boolean)
  if (parts.length === 0) return undefined

  let current: unknown
  if (parts[0] === 'contact') {
    current = context.contact ?? {}
    parts.shift()
  } else if (parts[0] === 'variables') {
    current = context.variables ?? {}
    parts.shift()
  } else {
    return undefined
  }

  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}
