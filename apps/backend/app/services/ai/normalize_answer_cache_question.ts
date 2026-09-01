export function normalizeAnswerCacheQuestion(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}
