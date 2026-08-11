import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { AiKnowledgeSourceType } from '#enums/ai_knowledge_source_type'

export async function extractKnowledgeText(sourceType: string, bytes: Uint8Array): Promise<string> {
  switch (sourceType) {
    case AiKnowledgeSourceType.MANUAL_TEXT:
      return new TextDecoder('utf-8').decode(bytes).trim()
    case AiKnowledgeSourceType.FILE_PDF:
      return extractPdf(bytes)
    case AiKnowledgeSourceType.FILE_DOCX:
      return extractDocx(bytes)
    default:
      throw new Error(`Cannot extract text from source type ${sourceType}`)
  }
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: Uint8Array.from(bytes) })
  try {
    const result = await parser.getText()
    return (result.text ?? '').trim()
  } finally {
    await parser.destroy()
  }
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
  return (result.value ?? '').trim()
}
