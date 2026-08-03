import db from '@adonisjs/lucid/services/db'
import ConversationException from '#exceptions/conversation_exception'

export type ConversationStatus = 'open' | 'pending' | 'closed'

export type ConversationContactSummary = {
  id: string
  name: string | null
  phone: string
  phoneNormalized: string
  email: string | null
  company: string | null
}

export type ConversationRecord = {
  id: string
  organizationId: string
  whatsappConfigId: string
  contactId: string
  status: string
  assignedAgentId: string | null
  lastMessageText: string | null
  lastMessageAt: string | null
  firstResponseAt: string | null
  closedAt: string | null
  unreadCount: number
  createdAt: string
  updatedAt: string | null
}

export type ConversationListItem = ConversationRecord & {
  contact: ConversationContactSummary
}

export type ConversationDetail = ConversationRecord & {
  contact: ConversationContactSummary
  unreadMessageCount: number
}

const CONVERSATION_COLUMNS = [
  'id',
  'organizationId',
  'whatsappConfigId',
  'contactId',
  'status',
  'assignedAgentId',
  'lastMessageText',
  'lastMessageAt',
  'firstResponseAt',
  'closedAt',
  'unreadCount',
  'createdAt',
  'updatedAt',
] as const

function toIso(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function mapConversationRow(r: Record<string, unknown>): ConversationRecord {
  return {
    id: r.id as string,
    organizationId: r.organizationId as string,
    whatsappConfigId: r.whatsappConfigId as string,
    contactId: r.contactId as string,
    status: r.status as string,
    assignedAgentId: (r.assignedAgentId as string | null) ?? null,
    lastMessageText: (r.lastMessageText as string | null) ?? null,
    lastMessageAt: toIso(r.lastMessageAt),
    firstResponseAt: toIso(r.firstResponseAt),
    closedAt: toIso(r.closedAt),
    unreadCount: Number(r.unreadCount ?? 0),
    createdAt: toIso(r.createdAt) as string,
    updatedAt: toIso(r.updatedAt),
  }
}

function mapContactSummary(r: Record<string, unknown>): ConversationContactSummary {
  return {
    id: r.contactId as string,
    name: (r.contactName as string | null) ?? null,
    phone: r.contactPhone as string,
    phoneNormalized: r.contactPhoneNormalized as string,
    email: (r.contactEmail as string | null) ?? null,
    company: (r.contactCompany as string | null) ?? null,
  }
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: string }).code
    if (code === '23505') return true
    current = (current as { cause?: unknown }).cause ?? (current as { original?: unknown }).original
  }
  return false
}

export class ConversationService {
  /**
   * Paginated inbox conversation list with optional filters and contact search.
   */
  async listConversationsPaginated(params: {
    organizationId: string
    status?: ConversationStatus
    assignedAgentId?: string
    search?: string
    page?: number
    limit?: number
  }) {
    const page = params.page ?? 1
    const limit = params.limit ?? 20

    let query = db
      .from('conversations as c')
      .innerJoin('contacts as ct', 'ct.id', 'c.contactId')
      .where('c.organizationId', params.organizationId)
      .whereNull('ct.deletedAt')

    if (params.status) {
      query = query.where('c.status', params.status)
    }

    if (params.assignedAgentId) {
      query = query.where('c.assignedAgentId', params.assignedAgentId)
    }

    if (params.search) {
      const term = `%${params.search}%`
      const digits = params.search.replace(/\D/g, '')
      query = query.where((q) => {
        q.whereILike('ct.name', term).orWhereILike('ct.phone', term)
        if (digits) {
          q.orWhereILike('ct.phoneNormalized', `%${digits}%`)
        }
      })
    }

    const countResult = await query.clone().count('* as total').first()
    const total = Number(countResult?.total ?? 0)

    const rows = await query
      .clone()
      .select(
        'c.id',
        'c.organizationId',
        'c.whatsappConfigId',
        'c.contactId',
        'c.status',
        'c.assignedAgentId',
        'c.lastMessageText',
        'c.lastMessageAt',
        'c.firstResponseAt',
        'c.closedAt',
        'c.unreadCount',
        'c.createdAt',
        'c.updatedAt',
        'ct.id as contactId',
        'ct.name as contactName',
        'ct.phone as contactPhone',
        'ct.phoneNormalized as contactPhoneNormalized',
        'ct.email as contactEmail',
        'ct.company as contactCompany'
      )
      .orderByRaw('"c"."lastMessageAt" DESC NULLS LAST')
      .orderBy('c.createdAt', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)

    const lastPage = Math.ceil(total / limit) || 1

    return {
      data: rows.map((r) => ({
        ...mapConversationRow(r),
        contact: mapContactSummary(r),
      })) as ConversationListItem[],
      meta: {
        total,
        perPage: limit,
        currentPage: page,
        lastPage,
      },
    }
  }

  /**
   * Single conversation with contact summary and unread count.
   */
  async getConversationById(params: {
    organizationId: string
    conversationId: string
  }): Promise<ConversationDetail> {
    const row = await this.findConversationWithContactOrFail(params)
    const conversation = mapConversationRow(row)

    return {
      ...conversation,
      contact: mapContactSummary(row),
      unreadMessageCount: conversation.unreadCount,
    }
  }

  /**
   * Create a conversation, or reopen a previously closed one for the same
   * (org, whatsappConfig, contact). Rejects duplicate active conversations.
   */
  async createConversation(params: {
    organizationId: string
    contactId: string
    whatsappConfigId: string
  }): Promise<ConversationRecord> {
    const { organizationId, contactId, whatsappConfigId } = params

    const contact = await db
      .from('contacts')
      .where('id', contactId)
      .where('organizationId', organizationId)
      .whereNull('deletedAt')
      .select('id')
      .first()

    if (!contact) {
      throw ConversationException.contactNotFound()
    }

    const whatsappConfig = await db
      .from('whatsapp_configs')
      .where('id', whatsappConfigId)
      .where('organizationId', organizationId)
      .select('id')
      .first()

    if (!whatsappConfig) {
      throw ConversationException.whatsappConfigNotFound()
    }

    const existing = await db
      .from('conversations')
      .where('organizationId', organizationId)
      .where('whatsappConfigId', whatsappConfigId)
      .where('contactId', contactId)
      .first()

    if (existing) {
      if (existing.status !== 'closed') {
        throw ConversationException.duplicateActive()
      }

      const [reopened] = await db
        .from('conversations')
        .where('id', existing.id)
        .update({
          status: 'open',
          closedAt: null,
          updatedAt: new Date(),
        })
        .returning([...CONVERSATION_COLUMNS])

      return mapConversationRow(reopened)
    }

    try {
      const [row] = await db
        .table('conversations')
        .insert({
          organizationId,
          contactId,
          whatsappConfigId,
          status: 'open',
          unreadCount: 0,
        })
        .returning([...CONVERSATION_COLUMNS])

      return mapConversationRow(row)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ConversationException.duplicateActive()
      }
      throw error
    }
  }

  /**
   * Partial update of editable conversation fields (currently status).
   * Keeps closedAt in sync with status transitions.
   */
  async updateConversation(params: {
    organizationId: string
    conversationId: string
    status?: ConversationStatus
  }): Promise<ConversationRecord> {
    const existing = await this.findConversationOrFail(params)

    if (params.status === undefined) {
      return mapConversationRow(existing)
    }

    const patch: Record<string, unknown> = {
      status: params.status,
      updatedAt: new Date(),
    }

    if (params.status === 'closed') {
      patch.closedAt = existing.closedAt ?? new Date()
    } else {
      patch.closedAt = null
    }

    const [row] = await db
      .from('conversations')
      .where('id', params.conversationId)
      .where('organizationId', params.organizationId)
      .update(patch)
      .returning([...CONVERSATION_COLUMNS])

    return mapConversationRow(row)
  }

  /**
   * Assign an agent and append assignment history.
   */
  async assignConversation(params: {
    organizationId: string
    conversationId: string
    assignedAgentId: string
    assignedByUserId: string
  }): Promise<ConversationRecord> {
    const { organizationId, conversationId, assignedAgentId, assignedByUserId } = params

    await this.findConversationOrFail({ organizationId, conversationId })

    const agentMember = await db
      .from('organization_members')
      .where('organizationId', organizationId)
      .where('userId', assignedAgentId)
      .where('isDeleted', false)
      .select('id')
      .first()

    if (!agentMember) {
      throw ConversationException.agentNotFound()
    }

    return db.transaction(async (trx) => {
      const [row] = await trx
        .from('conversations')
        .where('id', conversationId)
        .where('organizationId', organizationId)
        .update({
          assignedAgentId,
          updatedAt: new Date(),
        })
        .returning([...CONVERSATION_COLUMNS])

      await trx.table('conversation_assignments').insert({
        organizationId,
        conversationId,
        agentUserId: assignedAgentId,
        assignedByUserId,
      })

      return mapConversationRow(row)
    })
  }

  async closeConversation(params: {
    organizationId: string
    conversationId: string
  }): Promise<ConversationRecord> {
    await this.findConversationOrFail(params)

    const [row] = await db
      .from('conversations')
      .where('id', params.conversationId)
      .where('organizationId', params.organizationId)
      .update({
        status: 'closed',
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning([...CONVERSATION_COLUMNS])

    return mapConversationRow(row)
  }

  async reopenConversation(params: {
    organizationId: string
    conversationId: string
  }): Promise<ConversationRecord> {
    await this.findConversationOrFail(params)

    const [row] = await db
      .from('conversations')
      .where('id', params.conversationId)
      .where('organizationId', params.organizationId)
      .update({
        status: 'open',
        closedAt: null,
        updatedAt: new Date(),
      })
      .returning([...CONVERSATION_COLUMNS])

    return mapConversationRow(row)
  }

  private async findConversationOrFail(params: {
    organizationId: string
    conversationId: string
  }) {
    const row = await db
      .from('conversations')
      .where('id', params.conversationId)
      .where('organizationId', params.organizationId)
      .first()

    if (!row) {
      throw ConversationException.notFound()
    }

    return row
  }

  private async findConversationWithContactOrFail(params: {
    organizationId: string
    conversationId: string
  }) {
    const row = await db
      .from('conversations as c')
      .innerJoin('contacts as ct', 'ct.id', 'c.contactId')
      .where('c.id', params.conversationId)
      .where('c.organizationId', params.organizationId)
      .whereNull('ct.deletedAt')
      .select(
        'c.id',
        'c.organizationId',
        'c.whatsappConfigId',
        'c.contactId',
        'c.status',
        'c.assignedAgentId',
        'c.lastMessageText',
        'c.lastMessageAt',
        'c.firstResponseAt',
        'c.closedAt',
        'c.unreadCount',
        'c.createdAt',
        'c.updatedAt',
        'ct.id as contactId',
        'ct.name as contactName',
        'ct.phone as contactPhone',
        'ct.phoneNormalized as contactPhoneNormalized',
        'ct.email as contactEmail',
        'ct.company as contactCompany'
      )
      .first()

    if (!row) {
      throw ConversationException.notFound()
    }

    return row
  }
}
