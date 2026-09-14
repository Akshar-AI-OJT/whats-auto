/**
 * First case-insensitive substring match. Empty keywords never match.
 */
export function matchHandoverKeyword(text: string, keywords: string[]): string | null {
  const haystack = text.toLowerCase()
  for (const raw of keywords) {
    const keyword = raw.trim().toLowerCase()
    if (keyword && haystack.includes(keyword)) return raw.trim()
  }
  return null
}
