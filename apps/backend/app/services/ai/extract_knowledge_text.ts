import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'

/** Postgres UTF-8 text rejects 0x00; PDF/DOCX extractors often leave null bytes. */
export function sanitizeKnowledgeText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u0000/g, '').trim()
}

export async function extractKnowledgeText(sourceType: string, bytes: Uint8Array): Promise<string> {
  switch (sourceType) {
    case AiKnowledgeSourceType.FILE_TXT:
      return sanitizeKnowledgeText(new TextDecoder('utf-8').decode(bytes))
    case AiKnowledgeSourceType.FILE_PDF:
      return sanitizeKnowledgeText(await extractPdf(bytes))
    case AiKnowledgeSourceType.FILE_DOCX:
      return sanitizeKnowledgeText(await extractDocx(bytes))
    default:
      throw new Error(`Cannot extract text from source type ${sourceType}`)
  }
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: Uint8Array.from(bytes) })
  try {
    const result = await parser.getText()
    return result.text ?? ''
  } finally {
    await parser.destroy()
  }
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
  return result.value ?? ''
}
