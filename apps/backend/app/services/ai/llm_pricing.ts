export type ModelPrice = {
  inputPer1KTokens: number
  outputPer1KTokens: number
}

/**
 * Mid-2026 provider rate estimates for internal cost telemetry.
 * Verify against official provider pages before customer-facing billing.
 */
export const LLM_PRICING: Record<string, Record<string, ModelPrice>> = {
  mistral: {
    'mistral-small-2603': { inputPer1KTokens: 0.0001, outputPer1KTokens: 0.0003 },
    'ministral-3b-2512': { inputPer1KTokens: 0.00004, outputPer1KTokens: 0.00004 },
    'mistral-embed': { inputPer1KTokens: 0.0001, outputPer1KTokens: 0 },
  },
  openai: {
    'gpt-4o-mini': { inputPer1KTokens: 0.00015, outputPer1KTokens: 0.0006 },
    'gpt-4o': { inputPer1KTokens: 0.0025, outputPer1KTokens: 0.01 },
    'gpt-4.1-mini': { inputPer1KTokens: 0.0004, outputPer1KTokens: 0.0016 },
    'text-embedding-3-small': { inputPer1KTokens: 0.00002, outputPer1KTokens: 0 },
    'text-embedding-3-large': { inputPer1KTokens: 0.00013, outputPer1KTokens: 0 },
  },
  google: {
    'gemini-3.5-flash': { inputPer1KTokens: 0.00015, outputPer1KTokens: 0.0006 },
    'gemini-3.5-flash-lite': { inputPer1KTokens: 0.000075, outputPer1KTokens: 0.0003 },
    'gemini-embedding-2': { inputPer1KTokens: 0.00002, outputPer1KTokens: 0 },
  },
}

export function estimateTokensFromChars(charCount: number): number {
  return Math.ceil(charCount / 4)
}

export function estimateCostUsd(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const modelRates = LLM_PRICING[provider.toLowerCase()]?.[model]
  if (!modelRates) return 0

  const inputCost = (promptTokens / 1000) * modelRates.inputPer1KTokens
  const outputCost = (completionTokens / 1000) * modelRates.outputPer1KTokens
  return Number((inputCost + outputCost).toFixed(6))
}

export function estimateEmbeddingCostUsd(
  provider: string,
  model: string,
  inputTokens: number
): number {
  return estimateCostUsd(provider, model, inputTokens, 0)
}
