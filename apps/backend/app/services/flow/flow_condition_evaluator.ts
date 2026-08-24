export const FLOW_CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'regex',
  'greater_than',
  'less_than',
  'has_tag',
] as const

export type FlowConditionOperator = (typeof FLOW_CONDITION_OPERATORS)[number]

export type FlowConditionClause = {
  id: string
  variableKey: string
  operator: string
  value: string
}

export type FlowConditionEvalContext = {
  variables: Record<string, unknown>
  contact: {
    name?: string | null
    phone?: string | null
    tagIds?: string[]
    tagNames?: string[]
  }
}

/**
 * First matching condition wins. Returns that condition's id, or null for fallback.
 */
export function evaluateFlowConditions(
  conditions: FlowConditionClause[],
  context: FlowConditionEvalContext
): string | null {
  for (const condition of conditions) {
    if (matchesCondition(condition, context)) {
      return condition.id
    }
  }
  return null
}

export function resolveConditionVariable(
  variableKey: string,
  context: FlowConditionEvalContext
): unknown {
  const key = variableKey.trim()
  if (!key) return undefined

  if (key.startsWith('contact.')) {
    const field = key.slice('contact.'.length)
    if (field === 'name') return context.contact.name ?? null
    if (field === 'phone') return context.contact.phone ?? null
    return undefined
  }

  if (key.startsWith('variables.')) {
    return context.variables[key.slice('variables.'.length)]
  }

  return context.variables[key]
}

function matchesCondition(
  condition: FlowConditionClause,
  context: FlowConditionEvalContext
): boolean {
  const operator = condition.operator.trim()
  const expected = condition.value

  if (operator === 'has_tag') {
    const needle = expected.trim().toLowerCase()
    if (!needle) return false
    const ids = context.contact.tagIds ?? []
    const names = context.contact.tagNames ?? []
    return (
      ids.some((id) => id.toLowerCase() === needle) ||
      names.some((name) => name.toLowerCase() === needle)
    )
  }

  const actual = resolveConditionVariable(condition.variableKey, context)

  switch (operator) {
    case 'equals':
      return stringify(actual) === expected
    case 'not_equals':
      return stringify(actual) !== expected
    case 'contains':
      return stringify(actual).toLowerCase().includes(expected.toLowerCase())
    case 'regex': {
      try {
        return new RegExp(expected, 'i').test(stringify(actual))
      } catch {
        return false
      }
    }
    case 'greater_than': {
      const left = toNumber(actual)
      const right = toNumber(expected)
      return left !== null && right !== null && left > right
    }
    case 'less_than': {
      const left = toNumber(actual)
      const right = toNumber(expected)
      return left !== null && right !== null && left < right
    }
    default:
      return false
  }
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(stringify(value).trim())
  return Number.isFinite(parsed) ? parsed : null
}
