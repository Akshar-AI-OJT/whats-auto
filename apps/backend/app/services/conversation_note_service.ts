import db from '@adonisjs/lucid/services/db'
import ConversationException from '#exceptions/conversation_exception'

export type NoteCreatedBy = {
  id: string
  name: string | null
  email: string | null
}

export type ConversationNoteRecord = {
  id: string
  conversationId: string
  organizationId: string
  noteText: string
  createdBy: NoteCreatedBy
  createdAt: string
  updatedAt: string | null
}

const NOTE_COLUMNS = [
  'id',
  'organizationId',
  'conversationId',
  'authorUserId',
  'body',
  'createdAt',
  'updatedAt',
] as const

function toIso(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function mapNoteRow(r: Record<string, unknown>): ConversationNoteRecord {
  return {
    id: r.id as string,
    conversationId: r.conversationId as string,
    organizationId: r.organizationId as string,
    noteText: r.body as string,
    createdBy: {
      id: r.authorUserId as string,
      name: (r.authorName as string | null) ?? null,
      email: (r.authorEmail as string | null) ?? null,
    },
    createdAt: toIso(r.createdAt) as string,
    updatedAt: toIso(r.updatedAt),
  }
}

/**
 * Internal team notes for inbox conversations.
 * Stored only in `conversation_notes` — never sent to WhatsApp / Meta Graph.
 */
export class ConversationNoteService {
  /**
   * All internal notes for a conversation, chronological (createdAt ASC).
   */
  async listNotes(params: {
    organizationId: string
    conversationId: string
  }): Promise<ConversationNoteRecord[]> {
    await this.findConversationOrFail(params)

    const rows = await db
      .from('conversation_notes as n')
      .innerJoin('users as u', 'u.id', 'n.authorUserId')
      .where('n.organizationId', params.organizationId)
      .where('n.conversationId', params.conversationId)
      .select(
        'n.id',
        'n.organizationId',
        'n.conversationId',
        'n.authorUserId',
        'n.body',
        'n.createdAt',
        'n.updatedAt',
        'u.name as authorName',
        'u.email as authorEmail'
      )
      .orderBy('n.createdAt', 'asc')

    return rows.map((r) => mapNoteRow(r))
  }

  /**
   * Create an internal agent note. Does not create a chat message or call Meta.
   */
  async createNote(params: {
    organizationId: string
    conversationId: string
    authorUserId: string
    noteText: string
  }): Promise<ConversationNoteRecord> {
    await this.findConversationOrFail(params)

    const [inserted] = await db
      .table('conversation_notes')
      .insert({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        authorUserId: params.authorUserId,
        body: params.noteText,
      })
      .returning([...NOTE_COLUMNS])

    const author = await db
      .from('users')
      .where('id', params.authorUserId)
      .select('id', 'name', 'email')
      .first()

    return mapNoteRow({
      ...inserted,
      authorName: author?.name ?? null,
      authorEmail: author?.email ?? null,
    })
  }

  private async findConversationOrFail(params: {
    organizationId: string
    conversationId: string
  }) {
    const row = await db
      .from('conversations')
      .where('id', params.conversationId)
      .where('organizationId', params.organizationId)
      .select('id')
      .first()

    if (!row) {
      throw ConversationException.notFound()
    }

    return row
  }
}
