import db from '@adonisjs/lucid/services/db'
import type { MemoryTurn } from '#services/ai/contracts/memory_working_set_service'

const TURN_SENDER_TYPES = ['contact', 'agent', 'ai', 'bot'] as const

export class MemoryWorkingSetRepository {
  async listRecentTurns(params: {
    organizationId: string
    conversationId: string
    limit: number
  }): Promise<MemoryTurn[]> {
    if (params.limit <= 0) return []

    const rows = await db
      .from('messages')
      .where('organizationId', params.organizationId)
      .where('conversationId', params.conversationId)
      .whereIn('senderType', [...TURN_SENDER_TYPES])
      .whereNotNull('contentText')
      .whereNot('contentText', '')
      .orderBy('occurredAt', 'desc')
      .select('id', 'senderType', 'contentText', 'occurredAt')
      .limit(params.limit)

    return rows
      .map((row) => mapTurn(row))
      .filter((turn): turn is MemoryTurn => turn !== null)
      .reverse()
  }

  async countTurns(params: { organizationId: string; conversationId: string }): Promise<number> {
    const row = await db
      .from('messages')
      .where('organizationId', params.organizationId)
      .where('conversationId', params.conversationId)
      .whereIn('senderType', [...TURN_SENDER_TYPES])
      .whereNotNull('contentText')
      .whereNot('contentText', '')
      .count('* as total')
      .first()

    return Number(row?.total ?? 0)
  }
}

function toIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return new Date().toISOString()
}

function mapTurn(row: Record<string, unknown>): MemoryTurn | null {
  const content = typeof row.contentText === 'string' ? row.contentText.trim() : ''
  if (!content) return null

  const timestamp = toIso(row.occurredAt)

  return {
    role: row.senderType === 'contact' ? 'user' : 'assistant',
    content,
    timestamp,
    messageId: row.id as string,
  }
}
