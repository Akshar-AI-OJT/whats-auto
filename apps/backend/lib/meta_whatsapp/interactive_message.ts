/**
 * WhatsApp Cloud API interactive (button / list) payload rules.
 * Limits are enforced as hard failures — never truncated.
 */

export const META_INTERACTIVE_LIMITS = {
  maxButtons: 3,
  buttonTitleMax: 20,
  maxListRows: 10,
  sectionTitleMax: 24,
  rowTitleMax: 24,
  rowDescriptionMax: 72,
  listButtonTitleMax: 20,
} as const

export type MetaInteractiveButton = {
  type: 'reply'
  reply: { id: string; title: string }
}

export type MetaInteractiveListRow = {
  id: string
  title: string
  description?: string
}

export type MetaInteractiveListSection = {
  title: string
  rows: MetaInteractiveListRow[]
}

export type MetaInteractivePayload = {
  type: 'button' | 'list'
  header?: { type: 'text'; text: string }
  body: { text: string }
  footer?: { text: string }
  action: {
    buttons?: MetaInteractiveButton[]
    button?: string
    sections?: MetaInteractiveListSection[]
  }
}

export class InteractiveMessageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InteractiveMessageError'
  }
}

function requireNonEmpty(value: string | undefined, label: string): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    throw new InteractiveMessageError(`${label} is required`)
  }
  return trimmed
}

function assertMaxLength(value: string, max: number, label: string): void {
  if (value.length > max) {
    throw new InteractiveMessageError(`${label} exceeds ${max} characters`)
  }
}

/**
 * Validates a Cloud API interactive payload. Throws InteractiveMessageError
 * instead of truncating titles, descriptions, or row counts.
 */
export function assertInteractivePayload(interactive: MetaInteractivePayload): void {
  requireNonEmpty(interactive.body?.text, 'Interactive body text')

  if (interactive.header) {
    if (interactive.header.type !== 'text') {
      throw new InteractiveMessageError('Interactive header must be type "text"')
    }
    requireNonEmpty(interactive.header.text, 'Interactive header text')
  }

  if (interactive.footer?.text !== undefined) {
    requireNonEmpty(interactive.footer.text, 'Interactive footer text')
  }

  if (interactive.type === 'button') {
    assertButtonAction(interactive.action)
    return
  }

  if (interactive.type === 'list') {
    assertListAction(interactive.action)
    return
  }

  throw new InteractiveMessageError('Interactive type must be "button" or "list"')
}

function assertButtonAction(action: MetaInteractivePayload['action']): void {
  if (action.sections && action.sections.length > 0) {
    throw new InteractiveMessageError('Button interactive messages cannot include list sections')
  }
  if (action.button) {
    throw new InteractiveMessageError('Button interactive messages cannot include a list CTA')
  }

  const buttons = action.buttons ?? []
  if (buttons.length === 0) {
    throw new InteractiveMessageError('Interactive button messages require at least one button')
  }
  if (buttons.length > META_INTERACTIVE_LIMITS.maxButtons) {
    throw new InteractiveMessageError(
      `Interactive button messages allow at most ${META_INTERACTIVE_LIMITS.maxButtons} buttons`
    )
  }

  const ids = new Set<string>()
  for (const button of buttons) {
    if (button.type !== 'reply') {
      throw new InteractiveMessageError('Interactive buttons must use type "reply"')
    }
    const id = requireNonEmpty(button.reply?.id, 'Button id')
    const title = requireNonEmpty(button.reply?.title, 'Button title')
    assertMaxLength(title, META_INTERACTIVE_LIMITS.buttonTitleMax, 'Button title')
    if (ids.has(id)) {
      throw new InteractiveMessageError(`Duplicate interactive button id "${id}"`)
    }
    ids.add(id)
  }
}

function assertListAction(action: MetaInteractivePayload['action']): void {
  if (action.buttons && action.buttons.length > 0) {
    throw new InteractiveMessageError('List interactive messages cannot include reply buttons')
  }

  const cta = requireNonEmpty(action.button, 'List CTA button title')
  assertMaxLength(cta, META_INTERACTIVE_LIMITS.listButtonTitleMax, 'List CTA button title')

  const sections = action.sections ?? []
  if (sections.length === 0) {
    throw new InteractiveMessageError('Interactive list messages require at least one section')
  }

  let rowCount = 0
  const ids = new Set<string>()
  for (const section of sections) {
    const sectionTitle = requireNonEmpty(section.title, 'List section title')
    assertMaxLength(sectionTitle, META_INTERACTIVE_LIMITS.sectionTitleMax, 'List section title')
    if (!section.rows || section.rows.length === 0) {
      throw new InteractiveMessageError('List sections require at least one row')
    }
    for (const row of section.rows) {
      rowCount += 1
      if (rowCount > META_INTERACTIVE_LIMITS.maxListRows) {
        throw new InteractiveMessageError(
          `Interactive list messages allow at most ${META_INTERACTIVE_LIMITS.maxListRows} rows`
        )
      }
      const id = requireNonEmpty(row.id, 'List row id')
      const title = requireNonEmpty(row.title, 'List row title')
      assertMaxLength(title, META_INTERACTIVE_LIMITS.rowTitleMax, 'List row title')
      if (row.description !== undefined) {
        const description = requireNonEmpty(row.description, 'List row description')
        assertMaxLength(
          description,
          META_INTERACTIVE_LIMITS.rowDescriptionMax,
          'List row description'
        )
      }
      if (ids.has(id)) {
        throw new InteractiveMessageError(`Duplicate interactive list row id "${id}"`)
      }
      ids.add(id)
    }
  }
}

/**
 * Returns the Cloud API `interactive` object after validating Meta limits.
 */
export function serializeInteractivePayload(
  interactive: MetaInteractivePayload
): MetaInteractivePayload {
  assertInteractivePayload(interactive)
  return interactive
}
