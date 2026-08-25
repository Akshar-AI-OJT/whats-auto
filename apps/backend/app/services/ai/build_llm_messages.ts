import type { LlmCompletionOptions } from '#services/ai/contracts/llm_provider'

export type LlmChatMessage = {
  role: 'system' | 'user'
  content: string
}

/**
 * System message is instructions only. Retrieved chunks and the customer text
 * live in the user turn as delimited data (not instructions).
 */
export function buildLlmMessages(options: LlmCompletionOptions): LlmChatMessage[] {
  return [
    { role: 'system', content: options.systemPrompt },
    { role: 'user', content: buildUserContent(options) },
  ]
}

function buildUserContent(options: LlmCompletionOptions): string {
  const parts: string[] = []
  const context = formatContextChunks(options.contextChunks)
  if (context) {
    parts.push(`<reference_material>\n${context}\n</reference_material>`)
  }
  parts.push(`<customer_message>\n${options.userPrompt}\n</customer_message>`)
  return parts.join('\n\n')
}

function formatContextChunks(chunks: LlmCompletionOptions['contextChunks']): string | null {
  if (!chunks || chunks.length === 0) return null
  return chunks
    .map((chunk, index) => `[${index + 1} score=${chunk.score.toFixed(2)}] ${chunk.content}`)
    .join('\n')
}
