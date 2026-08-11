import type { LlmCompletionOptions } from '#services/ai/contracts/llm_provider'

export type LlmChatMessage = {
  role: 'system' | 'user'
  content: string
}

export function buildLlmMessages(options: LlmCompletionOptions): LlmChatMessage[] {
  const context = formatContextChunks(options.contextChunks)
  const systemPrompt = context
    ? `${options.systemPrompt}\n\nRetrieved context:\n${context}`
    : options.systemPrompt

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: options.userPrompt },
  ]
}

function formatContextChunks(chunks: LlmCompletionOptions['contextChunks']): string | null {
  if (!chunks || chunks.length === 0) return null
  return chunks
    .map((chunk, index) => `[${index + 1} score=${chunk.score.toFixed(2)}] ${chunk.content}`)
    .join('\n')
}
