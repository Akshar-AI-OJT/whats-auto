import logger from '@adonisjs/core/services/logger'
import { asString, type FlowNode } from '#lib/flow/flow_graph'
import type { MetaInteractivePayload } from '#lib/meta_whatsapp/interactive_message'
import {
  interpolateFlowText,
  type FlowInterpolationContext,
} from '#lib/flow/flow_variable_resolver'
import WhatsappOutboundService from '#services/whatsapp_outbound_service'

export type FlowOutboundSendResult = {
  kind: 'text' | 'media' | 'interactive' | 'template' | 'none'
  messageId?: string
  dispatchId?: string
}

/**
 * Translates Phase-4 executable nodes into WhatsappOutboundService calls.
 */
export default class FlowOutboundAdapter {
  constructor(private outbound: WhatsappOutboundService = new WhatsappOutboundService()) {}

  async sendMessageNode(params: {
    organizationId: string
    conversationId: string
    sessionId: string
    node: FlowNode
    context: FlowInterpolationContext
  }): Promise<FlowOutboundSendResult> {
    const messageType = asString(params.node.data.messageType) ?? 'text'
    const idempotencyKey = `flow:${params.sessionId}:${params.node.id}:message`

    if (messageType === 'text') {
      const raw = asString(params.node.data.text) ?? ''
      const text = interpolateFlowText(raw, params.context, {
        organizationId: params.organizationId,
        sessionId: params.sessionId,
        nodeId: params.node.id,
      }).trim()
      if (!text) {
        logger.warn({ nodeId: params.node.id }, 'flow.outbound.empty_text')
        return { kind: 'none' }
      }
      const queued = await this.outbound.queueText({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        text,
        senderType: 'system',
        idempotencyKey,
      })
      return { kind: 'text', messageId: queued.messageId, dispatchId: queued.dispatchId }
    }

    if (messageType === 'image' || messageType === 'document') {
      const mediaAssetId = asString(params.node.data.mediaAssetId)?.trim()
      if (!mediaAssetId) {
        logger.warn({ nodeId: params.node.id, messageType }, 'flow.outbound.media_missing_asset')
        return { kind: 'none' }
      }

      const captionRaw = asString(params.node.data.caption)
      const caption = captionRaw
        ? interpolateFlowText(captionRaw, params.context, {
            organizationId: params.organizationId,
            sessionId: params.sessionId,
            nodeId: params.node.id,
          })
        : null

      const queued = await this.outbound.queueMedia({
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        mediaType: messageType,
        mediaAssetId,
        caption,
        channel: 'system',
        idempotencyKey,
      })
      return { kind: 'media', messageId: queued.messageId, dispatchId: queued.dispatchId }
    }

    return { kind: 'none' }
  }

  async sendTemplateNode(params: {
    organizationId: string
    conversationId: string
    sessionId: string
    node: FlowNode
    context: FlowInterpolationContext
  }): Promise<FlowOutboundSendResult> {
    const templateId = asString(params.node.data.messageTemplateId)?.trim()
    if (!templateId) {
      logger.warn({ nodeId: params.node.id }, 'flow.outbound.template_missing_id')
      return { kind: 'none' }
    }

    const mappings = params.node.data.variableMappings
    const parameters: Record<string, string> = {}
    if (mappings && typeof mappings === 'object' && !Array.isArray(mappings)) {
      for (const [key, raw] of Object.entries(mappings as Record<string, unknown>)) {
        if (typeof raw !== 'string') continue
        parameters[key] = interpolateFlowText(raw, params.context, {
          organizationId: params.organizationId,
          sessionId: params.sessionId,
          nodeId: params.node.id,
        })
      }
    }

    const queued = await this.outbound.queueTemplate({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      templateId,
      parameters,
      channel: 'system',
      idempotencyKey: `flow:${params.sessionId}:${params.node.id}:template`,
    })
    return { kind: 'template', messageId: queued.messageId, dispatchId: queued.dispatchId }
  }

  async sendSystemText(params: {
    organizationId: string
    conversationId: string
    sessionId: string
    text: string
    idempotencyKey: string
  }): Promise<FlowOutboundSendResult> {
    const text = params.text.trim()
    if (!text) return { kind: 'none' }
    const queued = await this.outbound.queueText({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      text,
      senderType: 'system',
      idempotencyKey: params.idempotencyKey,
    })
    return { kind: 'text', messageId: queued.messageId, dispatchId: queued.dispatchId }
  }

  async sendAiText(params: {
    organizationId: string
    conversationId: string
    sessionId: string
    text: string
    idempotencyKey: string
  }): Promise<FlowOutboundSendResult> {
    const text = params.text.trim()
    if (!text) return { kind: 'none' }
    const queued = await this.outbound.queueText({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      text,
      senderType: 'ai',
      idempotencyKey: params.idempotencyKey,
    })
    return { kind: 'text', messageId: queued.messageId, dispatchId: queued.dispatchId }
  }

  async sendInteractiveButtonNode(params: {
    organizationId: string
    conversationId: string
    sessionId: string
    node: FlowNode
    context: FlowInterpolationContext
    visitKey: string
  }): Promise<FlowOutboundSendResult> {
    const interactive = this.#buildButtonPayload(params.node, params.context, {
      organizationId: params.organizationId,
      sessionId: params.sessionId,
      nodeId: params.node.id,
    })
    if (!interactive) return { kind: 'none' }

    const queued = await this.outbound.queueInteractive({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      interactive,
      senderType: 'system',
      idempotencyKey: `flow:${params.sessionId}:${params.node.id}:${params.visitKey}:interactive`,
    })
    return { kind: 'interactive', messageId: queued.messageId, dispatchId: queued.dispatchId }
  }

  async sendInteractiveListNode(params: {
    organizationId: string
    conversationId: string
    sessionId: string
    node: FlowNode
    context: FlowInterpolationContext
    visitKey: string
  }): Promise<FlowOutboundSendResult> {
    const interactive = this.#buildListPayload(params.node, params.context, {
      organizationId: params.organizationId,
      sessionId: params.sessionId,
      nodeId: params.node.id,
    })
    if (!interactive) return { kind: 'none' }

    const queued = await this.outbound.queueInteractive({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      interactive,
      senderType: 'system',
      idempotencyKey: `flow:${params.sessionId}:${params.node.id}:${params.visitKey}:interactive`,
    })
    return { kind: 'interactive', messageId: queued.messageId, dispatchId: queued.dispatchId }
  }

  #buildButtonPayload(
    node: FlowNode,
    context: FlowInterpolationContext,
    logContext: Record<string, unknown>
  ): MetaInteractivePayload | null {
    const bodyText = interpolateFlowText(asString(node.data.bodyText) ?? '', context, logContext)
    const buttonsRaw = Array.isArray(node.data.buttons) ? node.data.buttons : []
    const buttons = buttonsRaw
      .map((raw) => {
        if (!raw || typeof raw !== 'object') return null
        const button = raw as Record<string, unknown>
        const id = asString(button.id)?.trim()
        const title = asString(button.title)?.trim()
        if (!id || !title) return null
        return {
          type: 'reply' as const,
          reply: { id, title },
        }
      })
      .filter((button): button is NonNullable<typeof button> => button !== null)

    if (!bodyText.trim() || buttons.length === 0) return null

    const headerText = asString(node.data.headerText)?.trim()
    const footerText = asString(node.data.footerText)?.trim()

    return {
      type: 'button',
      ...(headerText ? { header: { type: 'text' as const, text: headerText } } : {}),
      body: { text: bodyText },
      ...(footerText ? { footer: { text: footerText } } : {}),
      action: { buttons },
    }
  }

  #buildListPayload(
    node: FlowNode,
    context: FlowInterpolationContext,
    logContext: Record<string, unknown>
  ): MetaInteractivePayload | null {
    const bodyText = interpolateFlowText(asString(node.data.bodyText) ?? '', context, logContext)
    const buttonTitle = asString(node.data.buttonTitle)?.trim() ?? ''
    const sectionsRaw = Array.isArray(node.data.sections) ? node.data.sections : []
    const sections = sectionsRaw
      .map((rawSection) => {
        if (!rawSection || typeof rawSection !== 'object') return null
        const section = rawSection as Record<string, unknown>
        const title = asString(section.title)?.trim() ?? ''
        const rowsRaw = Array.isArray(section.rows) ? section.rows : []
        const rows = rowsRaw
          .map((rawRow) => {
            if (!rawRow || typeof rawRow !== 'object') return null
            const row = rawRow as Record<string, unknown>
            const id = asString(row.id)?.trim()
            const rowTitle = asString(row.title)?.trim()
            if (!id || !rowTitle) return null
            const description = asString(row.description)?.trim()
            return {
              id,
              title: rowTitle,
              ...(description ? { description } : {}),
            }
          })
          .filter((row): row is NonNullable<typeof row> => row !== null)
        if (rows.length === 0) return null
        return { title, rows }
      })
      .filter((section): section is NonNullable<typeof section> => section !== null)

    if (!bodyText.trim() || !buttonTitle || sections.length === 0) return null

    const headerText = asString(node.data.headerText)?.trim()
    const footerText = asString(node.data.footerText)?.trim()

    return {
      type: 'list',
      ...(headerText ? { header: { type: 'text' as const, text: headerText } } : {}),
      body: { text: bodyText },
      ...(footerText ? { footer: { text: footerText } } : {}),
      action: { button: buttonTitle, sections },
    }
  }
}
