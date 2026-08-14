export type MemoryTurn = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  messageId?: string
}

/**
 * Last-N conversation turns. Redis is the hot list; Postgres messages are the fallback.
 * Bind via IoC — do not construct RedisMemoryWorkingSetService in domain jobs.
 */
export abstract class MemoryWorkingSetService {
  abstract appendTurn(
    organizationId: string,
    conversationId: string,
    turn: MemoryTurn
  ): Promise<void>

  abstract getRecentTurns(
    organizationId: string,
    conversationId: string,
    limit?: number
  ): Promise<MemoryTurn[]>

  abstract clearWorkingSet(organizationId: string, conversationId: string): Promise<void>
}
