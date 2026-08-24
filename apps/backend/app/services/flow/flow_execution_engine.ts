import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { ConversationAiMode } from '#enums/conversation_ai_mode'
import { FlowNodeType } from '#enums/flow_node_type'
import { FlowSessionStatus } from '#enums/flow_session_status'
import {
  asString,
  parseFlowGraph,
  parseFlowSettings,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
  type FlowTangentResumeMode,
} from '#lib/flow/flow_graph'
import type { FlowInterpolationContext } from '#lib/flow/flow_variable_resolver'
import { ContactConsentRepository } from '#repositories/contact_consent_repository'
import { ConversationAiRepository } from '#repositories/conversation_ai_repository'
import { FlowExecutionLogRepository } from '#repositories/flow_execution_log_repository'
import { FlowRepository } from '#repositories/flow_repository'
import { FlowSessionRepository, type FlowSessionRow } from '#repositories/flow_session_repository'
import type { FlowAdvanceSessionJobPayload } from '#services/flow/contracts/flow_job_payloads'
import FlowAiOrchestrator from '#services/flow/flow_ai_orchestrator'
import FlowOutboundAdapter from '#services/flow/flow_outbound_adapter'
import FlowSessionLifecycleService from '#services/flow/flow_session_lifecycle_service'
import {
  ensureMenuFrame,
  parseCallStack,
  popBack,
  pushSubflowFrame,
  unwindToRoot,
} from '#services/flow/flow_stack_manager'
import {
  evaluateFlowConditions,
  type FlowConditionClause,
} from '#services/flow/flow_condition_evaluator'
import { runWithTenant } from '#services/tenant_context'

const MAX_STEPS_PER_ADVANCE = 25

export const FLOW_STOP_FAREWELL =
  'You have been unsubscribed. You will no longer receive marketing messages.'

type EngineContact = FlowInterpolationContext['contact'] & {
  tagIds: string[]
  tagNames: string[]
}

export type FlowAdvanceResult = {
  sessionId: string
  status: string
  currentNodeId: string
  steps: number
}

/**
 * Run-until-wait / exit loop for executable node kinds (Phases 4–7).
 */
export default class FlowExecutionEngine {
  constructor(
    private sessions: FlowSessionRepository = new FlowSessionRepository(),
    private flows: FlowRepository = new FlowRepository(),
    private logs: FlowExecutionLogRepository = new FlowExecutionLogRepository(),
    private outbound: FlowOutboundAdapter = new FlowOutboundAdapter(),
    private consent: ContactConsentRepository = new ContactConsentRepository(),
    private ai: FlowAiOrchestrator = new FlowAiOrchestrator(),
    private conversations: ConversationAiRepository = new ConversationAiRepository(),
    private lifecycle: FlowSessionLifecycleService = new FlowSessionLifecycleService()
  ) {}

  async advance(payload: FlowAdvanceSessionJobPayload): Promise<FlowAdvanceResult | null> {
    return runWithTenant(payload.organizationId, async () => {
      const session = await this.#resolveSession(payload)
      if (!session) {
        logger.warn(
          {
            organizationId: payload.organizationId,
            conversationId: payload.conversationId,
            intent: payload.intent,
          },
          'flow.advance.session_missing'
        )
        return null
      }

      let version = await this.flows.findVersionById({
        organizationId: payload.organizationId,
        id: session.flowVersionId,
      })
      if (!version) {
        logger.warn({ sessionId: session.id }, 'flow.advance.version_missing')
        return null
      }

      let flow = await this.flows.findByIdForOrg({
        organizationId: payload.organizationId,
        id: session.flowId,
      })
      let settings = parseFlowSettings(flow?.settings)
      let graph = parseFlowGraph({
        nodes: version.nodes,
        edges: version.edges,
        viewport: version.viewport,
      })
      const contact = await this.#loadContact(payload.organizationId, session.contactId)

      let current = session
      let steps = 0

      const silenced = await this.#silenceIfHumanActive(current)
      if (silenced) {
        return {
          sessionId: silenced.id,
          status: silenced.status,
          currentNodeId: silenced.currentNodeId,
          steps: 0,
        }
      }

      if (payload.intent.type === 'resume' && this.#isExpired(current)) {
        await this.lifecycle.applyExpiry(current, { notify: false })
        current =
          (await this.sessions.findByIdForOrg({
            organizationId: current.organizationId,
            id: current.id,
          })) ?? current
        if (
          this.#isTerminal(current.status) ||
          current.status === FlowSessionStatus.PAUSED_FOR_HUMAN
        ) {
          return {
            sessionId: current.id,
            status: current.status,
            currentNodeId: current.currentNodeId,
            steps: 0,
          }
        }
      }

      if (current.status === FlowSessionStatus.PAUSED_FOR_HUMAN) {
        return {
          sessionId: current.id,
          status: current.status,
          currentNodeId: current.currentNodeId,
          steps: 0,
        }
      }

      // First turn on a waiting node: consume inbound reply before executing further.
      if (
        current.status === FlowSessionStatus.WAITING_FOR_INPUT &&
        payload.intent.type === 'resume'
      ) {
        const resumed = await this.#consumeWaitingInput({
          session: current,
          graph,
          payload,
          contact,
          settingsSessionTtlMinutes: settings.sessionTtlMinutes,
          tangentResume: settings.tangentResume,
        })
        if (!resumed || this.#isTerminal(resumed.status) || this.#isHoldStatus(resumed.status)) {
          const done = resumed ?? current
          return {
            sessionId: done.id,
            status: done.status,
            currentNodeId: done.currentNodeId,
            steps,
          }
        }
        current = resumed
      }

      while (steps < MAX_STEPS_PER_ADVANCE) {
        steps += 1

        if (current.flowVersionId !== version.id) {
          const nextVersion = await this.flows.findVersionById({
            organizationId: payload.organizationId,
            id: current.flowVersionId,
          })
          if (!nextVersion) {
            await this.#failSession(current, 'Flow version missing after navigation')
            return {
              sessionId: current.id,
              status: FlowSessionStatus.TERMINATED,
              currentNodeId: current.currentNodeId,
              steps,
            }
          }
          version = nextVersion
          flow = await this.flows.findByIdForOrg({
            organizationId: payload.organizationId,
            id: current.flowId,
          })
          settings = parseFlowSettings(flow?.settings)
          graph = parseFlowGraph({
            nodes: version.nodes,
            edges: version.edges,
            viewport: version.viewport,
          })
        }

        const node = graph.nodes.find((item) => item.id === current.currentNodeId)
        if (!node) {
          await this.#failSession(current, 'Current node missing from graph')
          return {
            sessionId: current.id,
            status: FlowSessionStatus.TERMINATED,
            currentNodeId: current.currentNodeId,
            steps,
          }
        }

        const outcome = await this.#executeNode({
          session: current,
          node,
          graph,
          payload,
          contact,
          settingsSessionTtlMinutes: settings.sessionTtlMinutes,
        })
        current = outcome.session

        if (outcome.stop) {
          return {
            sessionId: current.id,
            status: current.status,
            currentNodeId: current.currentNodeId,
            steps,
          }
        }
      }

      logger.warn({ sessionId: current.id, steps }, 'flow.advance.max_steps')
      return {
        sessionId: current.id,
        status: current.status,
        currentNodeId: current.currentNodeId,
        steps,
      }
    })
  }

  async #resolveSession(payload: FlowAdvanceSessionJobPayload): Promise<FlowSessionRow | null> {
    if (payload.intent.type === 'resume') {
      return this.sessions.findByIdForOrg({
        organizationId: payload.organizationId,
        id: payload.intent.sessionId,
      })
    }

    const existing = await this.sessions.findActiveForConversation({
      organizationId: payload.organizationId,
      conversationId: payload.conversationId,
    })
    if (existing) return existing

    const version = await this.flows.findVersionById({
      organizationId: payload.organizationId,
      id: payload.intent.flowVersionId,
    })
    if (!version) return null

    const graph = parseFlowGraph({
      nodes: version.nodes,
      edges: version.edges,
      viewport: version.viewport,
    })
    const trigger = graph.nodes.find((node) => node.type === FlowNodeType.TRIGGER)
    if (!trigger) return null

    const flow = await this.flows.findByIdForOrg({
      organizationId: payload.organizationId,
      id: payload.intent.flowId,
    })
    const settings = parseFlowSettings(flow?.settings)
    const expiresAt = new Date(Date.now() + settings.sessionTtlMinutes * 60_000)

    return this.sessions.insert({
      organizationId: payload.organizationId,
      conversationId: payload.conversationId,
      contactId: payload.contactId,
      flowId: payload.intent.flowId,
      flowVersionId: payload.intent.flowVersionId,
      currentNodeId: trigger.id,
      status: FlowSessionStatus.ACTIVE,
      callStack: [],
      variables: {},
      expiresAt,
    })
  }

  async #consumeWaitingInput(params: {
    session: FlowSessionRow
    graph: FlowGraph
    payload: FlowAdvanceSessionJobPayload
    contact: EngineContact
    settingsSessionTtlMinutes: number
    tangentResume: FlowTangentResumeMode
  }): Promise<FlowSessionRow | null> {
    const { session, graph, payload } = params
    const node = graph.nodes.find((item) => item.id === session.currentNodeId)
    if (!node) {
      await this.#failSession(session, 'Waiting node missing from graph')
      return null
    }

    const expiresAt = new Date(Date.now() + params.settingsSessionTtlMinutes * 60_000)
    const edges = graph.edges.filter((edge) => edge.source === node.id)

    if (
      node.type === FlowNodeType.INTERACTIVE_BUTTON ||
      node.type === FlowNodeType.INTERACTIVE_LIST
    ) {
      const replyId = payload.interactiveReplyId?.trim()
      const actionType = this.#actionTypeForHandle(node, replyId)

      if (actionType === 'STOP') {
        try {
          await this.consent.recordOptOut({
            organizationId: session.organizationId,
            contactId: session.contactId,
            source: 'keyword',
          })
        } catch (error) {
          logger.error({ err: error, sessionId: session.id }, 'flow.stop.opt_out_failed')
        }

        try {
          await this.outbound.sendSystemText({
            organizationId: session.organizationId,
            conversationId: session.conversationId,
            sessionId: session.id,
            text: FLOW_STOP_FAREWELL,
            idempotencyKey: `flow:${session.id}:stop:farewell`,
          })
        } catch (error) {
          logger.error({ err: error, sessionId: session.id }, 'flow.stop.farewell_failed')
        }

        await this.logs.insert({
          organizationId: session.organizationId,
          flowSessionId: session.id,
          conversationId: session.conversationId,
          nodeId: node.id,
          nodeType: node.type,
          actionTaken: 'STOP',
          inputPayload: { interactiveReplyId: replyId },
        })
        return (
          (await this.sessions.update({
            organizationId: session.organizationId,
            id: session.id,
            status: FlowSessionStatus.TERMINATED,
            lastInteractionAt: new Date(),
            expiresAt,
          })) ?? session
        )
      }

      if (actionType === 'BACK') {
        return this.#handleBackNavigation({
          session,
          node,
          replyId,
          expiresAt,
        })
      }

      if (actionType === 'MAIN_MENU') {
        return this.#handleMainMenuNavigation({
          session,
          node,
          replyId,
          expiresAt,
        })
      }

      if (!replyId) {
        const tangent = await this.#tryTangent({
          session,
          node,
          payload,
          expiresAt,
          tangentResume: params.tangentResume,
          fallbackToHandover: true,
        })
        if (tangent) return tangent

        await this.logs.insert({
          organizationId: session.organizationId,
          flowSessionId: session.id,
          conversationId: session.conversationId,
          nodeId: node.id,
          nodeType: node.type,
          actionTaken: 'WAIT_NO_REPLY_ID',
          inputPayload: { contentText: payload.contentText },
        })
        return session
      }

      const edge = edges.find((item) => item.sourceHandle?.trim() === replyId)
      if (!edge) {
        const tangent = await this.#tryTangent({
          session,
          node,
          payload,
          expiresAt,
          tangentResume: params.tangentResume,
          fallbackToHandover: true,
        })
        if (tangent) return tangent

        await this.logs.insert({
          organizationId: session.organizationId,
          flowSessionId: session.id,
          conversationId: session.conversationId,
          nodeId: node.id,
          nodeType: node.type,
          actionTaken: 'WAIT_UNMATCHED_HANDLE',
          inputPayload: { interactiveReplyId: replyId },
          errorMessage: `No edge for handle ${replyId}`,
        })
        return session
      }

      await this.logs.insert({
        organizationId: session.organizationId,
        flowSessionId: session.id,
        conversationId: session.conversationId,
        nodeId: node.id,
        nodeType: node.type,
        actionTaken: 'FOLLOW_HANDLE',
        inputPayload: { interactiveReplyId: replyId },
        outputPayload: { nextNodeId: edge.target },
      })

      return (
        (await this.sessions.update({
          organizationId: session.organizationId,
          id: session.id,
          currentNodeId: edge.target,
          status: FlowSessionStatus.ACTIVE,
          lastInteractionAt: new Date(),
          expiresAt,
        })) ?? session
      )
    }

    if (node.type === FlowNodeType.MESSAGE && node.data.waitForResponse) {
      const tangent = await this.#tryTangent({
        session,
        node,
        payload,
        expiresAt,
        tangentResume: params.tangentResume,
        fallbackToHandover: false,
      })
      if (tangent) return tangent

      const variables = { ...session.variables }
      const variableKey = asString(node.data.inputVariableKey)?.trim()
      if (variableKey) {
        variables[variableKey] = payload.contentText ?? ''
      }

      const next = this.#unlabeledEdge(edges)
      await this.logs.insert({
        organizationId: session.organizationId,
        flowSessionId: session.id,
        conversationId: session.conversationId,
        nodeId: node.id,
        nodeType: node.type,
        actionTaken: next ? 'FOLLOW_AFTER_INPUT' : 'INPUT_NO_EDGE',
        inputPayload: { contentText: payload.contentText, variableKey },
        outputPayload: next ? { nextNodeId: next.target } : null,
      })

      if (!next) {
        return (
          (await this.sessions.update({
            organizationId: session.organizationId,
            id: session.id,
            status: FlowSessionStatus.COMPLETED,
            variables,
            lastInteractionAt: new Date(),
            expiresAt,
          })) ?? session
        )
      }

      return (
        (await this.sessions.update({
          organizationId: session.organizationId,
          id: session.id,
          currentNodeId: next.target,
          status: FlowSessionStatus.ACTIVE,
          variables,
          lastInteractionAt: new Date(),
          expiresAt,
        })) ?? session
      )
    }

    return session
  }

  async #executeNode(params: {
    session: FlowSessionRow
    node: FlowNode
    graph: FlowGraph
    payload: FlowAdvanceSessionJobPayload
    contact: EngineContact
    settingsSessionTtlMinutes: number
  }): Promise<{ session: FlowSessionRow; stop: boolean }> {
    const { session, node, graph, payload, contact } = params
    const expiresAt = new Date(Date.now() + params.settingsSessionTtlMinutes * 60_000)
    const context: FlowInterpolationContext = {
      contact,
      variables: session.variables,
    }
    const edges = graph.edges.filter((edge) => edge.source === node.id)

    try {
      switch (node.type) {
        case FlowNodeType.TRIGGER: {
          await this.logs.insert({
            organizationId: session.organizationId,
            flowSessionId: session.id,
            conversationId: session.conversationId,
            nodeId: node.id,
            nodeType: node.type,
            actionTaken: 'ENTER',
            inputPayload: { messageId: payload.messageId },
          })
          return this.#followUnlabeled({
            session,
            edges,
            expiresAt,
            actionTaken: 'FOLLOW',
            node,
          })
        }

        case FlowNodeType.MESSAGE: {
          const sent = await this.outbound.sendMessageNode({
            organizationId: session.organizationId,
            conversationId: session.conversationId,
            sessionId: session.id,
            node,
            context,
          })
          await this.logs.insert({
            organizationId: session.organizationId,
            flowSessionId: session.id,
            conversationId: session.conversationId,
            nodeId: node.id,
            nodeType: node.type,
            actionTaken: 'SEND_MESSAGE',
            outputPayload: sent,
          })

          if (node.data.waitForResponse) {
            const updated =
              (await this.sessions.update({
                organizationId: session.organizationId,
                id: session.id,
                status: FlowSessionStatus.WAITING_FOR_INPUT,
                lastInteractionAt: new Date(),
                expiresAt,
              })) ?? session
            return { session: updated, stop: true }
          }

          return this.#followUnlabeled({
            session,
            edges,
            expiresAt,
            actionTaken: 'FOLLOW',
            node,
          })
        }

        case FlowNodeType.TEMPLATE: {
          const sent = await this.outbound.sendTemplateNode({
            organizationId: session.organizationId,
            conversationId: session.conversationId,
            sessionId: session.id,
            node,
            context,
          })
          await this.logs.insert({
            organizationId: session.organizationId,
            flowSessionId: session.id,
            conversationId: session.conversationId,
            nodeId: node.id,
            nodeType: node.type,
            actionTaken: 'SEND_TEMPLATE',
            outputPayload: sent,
          })
          return this.#followUnlabeled({
            session,
            edges,
            expiresAt,
            actionTaken: 'FOLLOW',
            node,
          })
        }

        case FlowNodeType.INTERACTIVE_BUTTON:
        case FlowNodeType.INTERACTIVE_LIST: {
          return this.#presentInteractiveMenu({
            session,
            node,
            context,
            expiresAt,
          })
        }

        case FlowNodeType.CONDITION: {
          return this.#executeCondition({
            session,
            node,
            edges,
            contact,
            expiresAt,
          })
        }

        case FlowNodeType.SUBFLOW: {
          return this.#executeSubflow({
            session,
            node,
            edges,
            expiresAt,
          })
        }

        case FlowNodeType.AI_RAG: {
          return this.#executeAiRag({
            session,
            node,
            edges,
            payload,
            expiresAt,
          })
        }

        case FlowNodeType.HUMAN_HANDOVER: {
          return this.#executeHumanHandover({
            session,
            node,
            expiresAt,
          })
        }

        case FlowNodeType.EXIT: {
          const returned = await this.#tryExitSubflow({
            session,
            node,
            expiresAt,
          })
          if (returned) return returned

          await this.logs.insert({
            organizationId: session.organizationId,
            flowSessionId: session.id,
            conversationId: session.conversationId,
            nodeId: node.id,
            nodeType: node.type,
            actionTaken: 'EXIT',
          })
          const updated =
            (await this.sessions.update({
              organizationId: session.organizationId,
              id: session.id,
              status: FlowSessionStatus.COMPLETED,
              lastInteractionAt: new Date(),
              expiresAt,
            })) ?? session
          return { session: updated, stop: true }
        }

        default: {
          await this.logs.insert({
            organizationId: session.organizationId,
            flowSessionId: session.id,
            conversationId: session.conversationId,
            nodeId: node.id,
            nodeType: node.type,
            actionTaken: 'UNSUPPORTED_NODE',
            errorMessage: `Node type ${node.type} is not executed yet`,
          })
          const updated =
            (await this.sessions.update({
              organizationId: session.organizationId,
              id: session.id,
              status: FlowSessionStatus.TERMINATED,
              lastInteractionAt: new Date(),
              expiresAt,
            })) ?? session
          return { session: updated, stop: true }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown'
      logger.warn(
        { sessionId: session.id, nodeId: node.id, err: message },
        'flow.execute.node_failed'
      )
      await this.logs.insert({
        organizationId: session.organizationId,
        flowSessionId: session.id,
        conversationId: session.conversationId,
        nodeId: node.id,
        nodeType: node.type,
        actionTaken: 'ERROR',
        errorMessage: message,
      })
      const updated =
        (await this.sessions.update({
          organizationId: session.organizationId,
          id: session.id,
          status: FlowSessionStatus.TERMINATED,
          lastInteractionAt: new Date(),
          expiresAt,
        })) ?? session
      return { session: updated, stop: true }
    }
  }

  async #followUnlabeled(params: {
    session: FlowSessionRow
    edges: FlowEdge[]
    expiresAt: Date
    actionTaken: string
    node: FlowNode
  }): Promise<{ session: FlowSessionRow; stop: boolean }> {
    const next = this.#unlabeledEdge(params.edges)
    if (!next) {
      await this.logs.insert({
        organizationId: params.session.organizationId,
        flowSessionId: params.session.id,
        conversationId: params.session.conversationId,
        nodeId: params.node.id,
        nodeType: params.node.type,
        actionTaken: 'NO_OUTGOING',
      })
      const updated =
        (await this.sessions.update({
          organizationId: params.session.organizationId,
          id: params.session.id,
          status: FlowSessionStatus.COMPLETED,
          lastInteractionAt: new Date(),
          expiresAt: params.expiresAt,
        })) ?? params.session
      return { session: updated, stop: true }
    }

    const updated =
      (await this.sessions.update({
        organizationId: params.session.organizationId,
        id: params.session.id,
        currentNodeId: next.target,
        status: FlowSessionStatus.ACTIVE,
        lastInteractionAt: new Date(),
        expiresAt: params.expiresAt,
      })) ?? params.session
    return { session: updated, stop: false }
  }

  #unlabeledEdge(edges: FlowEdge[]): FlowEdge | undefined {
    return edges.find((edge) => !edge.sourceHandle || !edge.sourceHandle.trim())
  }

  async #presentInteractiveMenu(params: {
    session: FlowSessionRow
    node: FlowNode
    context: FlowInterpolationContext
    expiresAt: Date
  }): Promise<{ session: FlowSessionRow; stop: boolean }> {
    const { session, node, context, expiresAt } = params
    const callStack = ensureMenuFrame(parseCallStack(session.callStack), {
      flowId: session.flowId,
      flowVersionId: session.flowVersionId,
      nodeId: node.id,
      menuNodeId: node.id,
      variablesSnapshot: { ...session.variables },
      enteredAt: new Date().toISOString(),
    })
    if (!callStack) {
      await this.logs.insert({
        organizationId: session.organizationId,
        flowSessionId: session.id,
        conversationId: session.conversationId,
        nodeId: node.id,
        nodeType: node.type,
        actionTaken: 'STACK_DEPTH_EXCEEDED',
        errorMessage: 'Max flow stack depth exceeded',
      })
      const updated =
        (await this.sessions.update({
          organizationId: session.organizationId,
          id: session.id,
          status: FlowSessionStatus.TERMINATED,
          lastInteractionAt: new Date(),
          expiresAt,
        })) ?? session
      return { session: updated, stop: true }
    }
    const visitKey = visitKeyFrom(session)
    const sent =
      node.type === FlowNodeType.INTERACTIVE_LIST
        ? await this.outbound.sendInteractiveListNode({
            organizationId: session.organizationId,
            conversationId: session.conversationId,
            sessionId: session.id,
            node,
            context,
            visitKey,
          })
        : await this.outbound.sendInteractiveButtonNode({
            organizationId: session.organizationId,
            conversationId: session.conversationId,
            sessionId: session.id,
            node,
            context,
            visitKey,
          })

    await this.logs.insert({
      organizationId: session.organizationId,
      flowSessionId: session.id,
      conversationId: session.conversationId,
      nodeId: node.id,
      nodeType: node.type,
      actionTaken:
        node.type === FlowNodeType.INTERACTIVE_LIST
          ? 'SEND_INTERACTIVE_LIST'
          : 'SEND_INTERACTIVE_BUTTON',
      outputPayload: sent,
    })

    const updated =
      (await this.sessions.update({
        organizationId: session.organizationId,
        id: session.id,
        status: FlowSessionStatus.WAITING_FOR_INPUT,
        callStack,
        lastInteractionAt: new Date(),
        expiresAt,
      })) ?? session
    return { session: updated, stop: true }
  }

  #isHoldStatus(status: string): boolean {
    return (
      status === FlowSessionStatus.WAITING_FOR_INPUT ||
      status === FlowSessionStatus.PAUSED_FOR_HUMAN ||
      status === FlowSessionStatus.PAUSED_FOR_AI
    )
  }

  #isExpired(session: FlowSessionRow, now = new Date()): boolean {
    return new Date(session.expiresAt).getTime() <= now.getTime()
  }

  async #silenceIfHumanActive(session: FlowSessionRow): Promise<FlowSessionRow | null> {
    if (session.status === FlowSessionStatus.PAUSED_FOR_HUMAN) return session
    const state = await this.conversations.findById({
      organizationId: session.organizationId,
      conversationId: session.conversationId,
    })
    if (state?.aiMode !== ConversationAiMode.HUMAN_ACTIVE) return null

    await this.sessions.pauseActiveForConversation({
      organizationId: session.organizationId,
      conversationId: session.conversationId,
    })
    return (
      (await this.sessions.findByIdForOrg({
        organizationId: session.organizationId,
        id: session.id,
      })) ?? { ...session, status: FlowSessionStatus.PAUSED_FOR_HUMAN }
    )
  }

  #isTerminal(status: string): boolean {
    return status === FlowSessionStatus.COMPLETED || status === FlowSessionStatus.TERMINATED
  }

  async #tryTangent(params: {
    session: FlowSessionRow
    node: FlowNode
    payload: FlowAdvanceSessionJobPayload
    expiresAt: Date
    tangentResume: FlowTangentResumeMode
    fallbackToHandover: boolean
  }): Promise<FlowSessionRow | null> {
    const userText = params.payload.contentText?.trim() ?? ''
    if (!userText) return null

    const result = await this.ai.handleUnexpectedInput({
      organizationId: params.session.organizationId,
      conversationId: params.session.conversationId,
      sessionId: params.session.id,
      messageId: params.payload.messageId,
      userText,
      currentNode: params.node,
      tangentResume: params.tangentResume,
      fallbackToHandover: params.fallbackToHandover,
    })
    if (!result.handled) return null

    await this.logs.insert({
      organizationId: params.session.organizationId,
      flowSessionId: params.session.id,
      conversationId: params.session.conversationId,
      nodeId: params.node.id,
      nodeType: params.node.type,
      actionTaken: result.action,
      inputPayload: { contentText: userText, reason: result.reason ?? null },
    })

    if (result.action === 'HANDOVER') {
      return (
        (await this.sessions.update({
          organizationId: params.session.organizationId,
          id: params.session.id,
          status: FlowSessionStatus.PAUSED_FOR_HUMAN,
          lastInteractionAt: new Date(),
          expiresAt: params.expiresAt,
        })) ?? params.session
      )
    }

    return (
      (await this.sessions.update({
        organizationId: params.session.organizationId,
        id: params.session.id,
        status: FlowSessionStatus.WAITING_FOR_INPUT,
        lastInteractionAt: new Date(),
        expiresAt: params.expiresAt,
      })) ?? params.session
    )
  }

  async #executeAiRag(params: {
    session: FlowSessionRow
    node: FlowNode
    edges: FlowEdge[]
    payload: FlowAdvanceSessionJobPayload
    expiresAt: Date
  }): Promise<{ session: FlowSessionRow; stop: boolean }> {
    const { session, node, edges, payload, expiresAt } = params
    const override = asString(node.data.minConfidenceScore)
    const minConfidenceScore = override ? Number(override) : undefined
    const answered = await this.ai.answerFromKnowledge({
      organizationId: session.organizationId,
      query: payload.contentText ?? '',
      systemPromptOverride: asString(node.data.systemPromptOverride),
      minConfidenceScore:
        minConfidenceScore !== undefined && Number.isFinite(minConfidenceScore)
          ? minConfidenceScore
          : undefined,
    })

    if (answered.kind === 'answered' && answered.text) {
      await this.outbound.sendAiText({
        organizationId: session.organizationId,
        conversationId: session.conversationId,
        sessionId: session.id,
        text: answered.text,
        idempotencyKey: `flow:${session.id}:${node.id}:ai_rag`,
      })
      await this.logs.insert({
        organizationId: session.organizationId,
        flowSessionId: session.id,
        conversationId: session.conversationId,
        nodeId: node.id,
        nodeType: node.type,
        actionTaken: 'AI_RAG_ANSWER',
        outputPayload: { maxScore: answered.maxScore ?? null },
      })
      return this.#followUnlabeled({
        session,
        edges,
        expiresAt,
        actionTaken: 'FOLLOW',
        node,
      })
    }

    const fallbackAction = asString(node.data.fallbackAction) ?? 'HUMAN_HANDOVER'
    if (fallbackAction === 'ROUTE_EDGE') {
      const handle = asString(node.data.fallbackTargetHandle)?.trim()
      const edge = edges.find((item) => item.sourceHandle?.trim() === handle)
      await this.logs.insert({
        organizationId: session.organizationId,
        flowSessionId: session.id,
        conversationId: session.conversationId,
        nodeId: node.id,
        nodeType: node.type,
        actionTaken: 'AI_RAG_FALLBACK_EDGE',
        inputPayload: { reason: answered.reason ?? answered.kind },
        outputPayload: edge ? { nextNodeId: edge.target } : null,
      })
      if (!edge) {
        return this.#pauseForHuman({
          session,
          node,
          expiresAt,
          reason: 'ai_rag_missing_fallback_edge',
        })
      }
      const updated =
        (await this.sessions.update({
          organizationId: session.organizationId,
          id: session.id,
          currentNodeId: edge.target,
          status: FlowSessionStatus.ACTIVE,
          lastInteractionAt: new Date(),
          expiresAt,
        })) ?? session
      return { session: updated, stop: false }
    }

    await this.logs.insert({
      organizationId: session.organizationId,
      flowSessionId: session.id,
      conversationId: session.conversationId,
      nodeId: node.id,
      nodeType: node.type,
      actionTaken: 'AI_RAG_HANDOVER',
      inputPayload: { reason: answered.reason ?? answered.kind },
    })
    return this.#pauseForHuman({
      session,
      node,
      expiresAt,
      reason: answered.reason ?? 'low_confidence',
    })
  }

  async #executeHumanHandover(params: {
    session: FlowSessionRow
    node: FlowNode
    expiresAt: Date
  }): Promise<{ session: FlowSessionRow; stop: boolean }> {
    const { session, node, expiresAt } = params
    const message = asString(node.data.handoverMessage)?.trim()
    if (message) {
      await this.outbound.sendSystemText({
        organizationId: session.organizationId,
        conversationId: session.conversationId,
        sessionId: session.id,
        text: message,
        idempotencyKey: `flow:${session.id}:${node.id}:handover`,
      })
    }
    const reason = asString(node.data.reason)?.trim() || 'human_handover'
    await this.logs.insert({
      organizationId: session.organizationId,
      flowSessionId: session.id,
      conversationId: session.conversationId,
      nodeId: node.id,
      nodeType: node.type,
      actionTaken: 'HUMAN_HANDOVER',
      inputPayload: { reason },
    })
    return this.#pauseForHuman({ session, node, expiresAt, reason })
  }

  async #pauseForHuman(params: {
    session: FlowSessionRow
    node: FlowNode
    expiresAt: Date
    reason: string
  }): Promise<{ session: FlowSessionRow; stop: boolean }> {
    await this.ai.triggerHandover({
      organizationId: params.session.organizationId,
      conversationId: params.session.conversationId,
      reason: params.reason,
    })
    const updated =
      (await this.sessions.update({
        organizationId: params.session.organizationId,
        id: params.session.id,
        status: FlowSessionStatus.PAUSED_FOR_HUMAN,
        lastInteractionAt: new Date(),
        expiresAt: params.expiresAt,
      })) ?? params.session
    return { session: updated, stop: true }
  }

  #actionTypeForHandle(node: FlowNode, handle: string | null | undefined): string | null {
    if (!handle) return null
    if (node.type === FlowNodeType.INTERACTIVE_BUTTON) {
      const buttons = Array.isArray(node.data.buttons) ? node.data.buttons : []
      for (const raw of buttons) {
        if (!raw || typeof raw !== 'object') continue
        const button = raw as Record<string, unknown>
        if (asString(button.id)?.trim() === handle) {
          return asString(button.actionType) ?? 'DEFAULT'
        }
      }
    }
    if (node.type === FlowNodeType.INTERACTIVE_LIST) {
      const sections = Array.isArray(node.data.sections) ? node.data.sections : []
      for (const rawSection of sections) {
        if (!rawSection || typeof rawSection !== 'object') continue
        const section = rawSection as Record<string, unknown>
        const rows = Array.isArray(section.rows) ? section.rows : []
        for (const rawRow of rows) {
          if (!rawRow || typeof rawRow !== 'object') continue
          const row = rawRow as Record<string, unknown>
          if (asString(row.id)?.trim() === handle) {
            return asString(row.actionType) ?? 'DEFAULT'
          }
        }
      }
    }
    return null
  }

  async #failSession(session: FlowSessionRow, reason: string): Promise<void> {
    await this.logs.insert({
      organizationId: session.organizationId,
      flowSessionId: session.id,
      conversationId: session.conversationId,
      nodeId: session.currentNodeId,
      nodeType: 'UNKNOWN',
      actionTaken: 'TERMINATE',
      errorMessage: reason,
    })
    await this.sessions.update({
      organizationId: session.organizationId,
      id: session.id,
      status: FlowSessionStatus.TERMINATED,
      lastInteractionAt: new Date(),
    })
  }

  async #loadContact(organizationId: string, contactId: string): Promise<EngineContact> {
    const row = await db
      .from('contacts')
      .where('organizationId', organizationId)
      .where('id', contactId)
      .first()

    const tagRows = await db
      .from('contact_tags as ct')
      .leftJoin('tags as t', 't.id', 'ct.tagId')
      .where('ct.organizationId', organizationId)
      .where('ct.contactId', contactId)
      .select('ct.tagId', 't.name as tagName')

    const tagIds = tagRows.map((item) => String(item.tagId))
    const tagNames = tagRows
      .map((item) => (item.tagName as string | null) ?? '')
      .filter((name) => name.length > 0)

    if (!row) {
      return { tagIds, tagNames }
    }
    return {
      name: (row.name as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      tagIds,
      tagNames,
    }
  }

  async #handleBackNavigation(params: {
    session: FlowSessionRow
    node: FlowNode
    replyId: string | null | undefined
    expiresAt: Date
  }): Promise<FlowSessionRow> {
    const { session, node, replyId, expiresAt } = params
    const popped = popBack(parseCallStack(session.callStack))
    if (!popped) {
      await this.logs.insert({
        organizationId: session.organizationId,
        flowSessionId: session.id,
        conversationId: session.conversationId,
        nodeId: node.id,
        nodeType: node.type,
        actionTaken: 'NAV_BACK_AT_ROOT',
        inputPayload: { interactiveReplyId: replyId },
        outputPayload: { nextNodeId: node.id },
      })
      return (
        (await this.sessions.update({
          organizationId: session.organizationId,
          id: session.id,
          currentNodeId: node.id,
          status: FlowSessionStatus.ACTIVE,
          lastInteractionAt: new Date(),
          expiresAt,
        })) ?? session
      )
    }

    const top = popped.callStack[popped.callStack.length - 1]
    if (top?.kind === 'subflow') {
      const returned = await this.#returnToParentAfterSubflow({
        session,
        callerFrame: top,
        callStack: popped.callStack.slice(0, -1),
        expiresAt,
        actionTaken: 'NAV_BACK_SUBFLOW',
        replyId,
      })
      return returned.session
    }

    await this.logs.insert({
      organizationId: session.organizationId,
      flowSessionId: session.id,
      conversationId: session.conversationId,
      nodeId: node.id,
      nodeType: node.type,
      actionTaken: 'NAV_BACK',
      inputPayload: { interactiveReplyId: replyId },
      outputPayload: { nextNodeId: popped.targetNodeId },
    })
    return (
      (await this.sessions.update({
        organizationId: session.organizationId,
        id: session.id,
        flowId: popped.targetFlowId,
        flowVersionId: popped.targetVersionId,
        currentNodeId: popped.targetNodeId,
        callStack: popped.callStack,
        status: FlowSessionStatus.ACTIVE,
        lastInteractionAt: new Date(),
        expiresAt,
      })) ?? session
    )
  }

  async #handleMainMenuNavigation(params: {
    session: FlowSessionRow
    node: FlowNode
    replyId: string | null | undefined
    expiresAt: Date
  }): Promise<FlowSessionRow> {
    const { session, node, replyId, expiresAt } = params
    const root = unwindToRoot(parseCallStack(session.callStack))
    const targetNodeId = root?.targetNodeId ?? node.id
    await this.logs.insert({
      organizationId: session.organizationId,
      flowSessionId: session.id,
      conversationId: session.conversationId,
      nodeId: node.id,
      nodeType: node.type,
      actionTaken: 'NAV_MAIN_MENU',
      inputPayload: { interactiveReplyId: replyId },
      outputPayload: { nextNodeId: targetNodeId },
    })
    return (
      (await this.sessions.update({
        organizationId: session.organizationId,
        id: session.id,
        flowId: root?.targetFlowId ?? session.flowId,
        flowVersionId: root?.targetVersionId ?? session.flowVersionId,
        currentNodeId: targetNodeId,
        callStack: root?.callStack ?? parseCallStack(session.callStack),
        ...(root && root.targetFlowId !== session.flowId ? { variables: root.variables } : {}),
        status: FlowSessionStatus.ACTIVE,
        lastInteractionAt: new Date(),
        expiresAt,
      })) ?? session
    )
  }

  async #executeCondition(params: {
    session: FlowSessionRow
    node: FlowNode
    edges: FlowEdge[]
    contact: EngineContact
    expiresAt: Date
  }): Promise<{ session: FlowSessionRow; stop: boolean }> {
    const { session, node, edges, contact, expiresAt } = params
    const fallbackHandle = asString(node.data.fallbackHandle)?.trim() ?? ''
    const rawConditions = Array.isArray(node.data.conditions) ? node.data.conditions : []
    const conditions: FlowConditionClause[] = []
    for (const raw of rawConditions) {
      if (!raw || typeof raw !== 'object') continue
      const record = raw as Record<string, unknown>
      const id = asString(record.id)?.trim()
      const variableKey = asString(record.variableKey) ?? ''
      const operator = asString(record.operator) ?? ''
      const value = asString(record.value) ?? ''
      if (!id) continue
      conditions.push({ id, variableKey, operator, value })
    }

    const matchedId = evaluateFlowConditions(conditions, {
      variables: session.variables,
      contact: {
        name: contact?.name,
        phone: contact?.phone,
        tagIds: contact.tagIds,
        tagNames: contact.tagNames,
      },
    })
    const handle = matchedId ?? fallbackHandle
    const edge = edges.find((item) => item.sourceHandle?.trim() === handle)

    await this.logs.insert({
      organizationId: session.organizationId,
      flowSessionId: session.id,
      conversationId: session.conversationId,
      nodeId: node.id,
      nodeType: node.type,
      actionTaken: matchedId ? 'CONDITION_MATCH' : 'CONDITION_FALLBACK',
      inputPayload: { matchedId, handle },
      outputPayload: edge ? { nextNodeId: edge.target } : null,
      errorMessage: edge ? null : `No edge for condition handle ${handle}`,
    })

    if (!edge) {
      const updated =
        (await this.sessions.update({
          organizationId: session.organizationId,
          id: session.id,
          status: FlowSessionStatus.TERMINATED,
          lastInteractionAt: new Date(),
          expiresAt,
        })) ?? session
      return { session: updated, stop: true }
    }

    const updated =
      (await this.sessions.update({
        organizationId: session.organizationId,
        id: session.id,
        currentNodeId: edge.target,
        status: FlowSessionStatus.ACTIVE,
        lastInteractionAt: new Date(),
        expiresAt,
      })) ?? session
    return { session: updated, stop: false }
  }

  async #executeSubflow(params: {
    session: FlowSessionRow
    node: FlowNode
    edges: FlowEdge[]
    expiresAt: Date
  }): Promise<{ session: FlowSessionRow; stop: boolean }> {
    const { session, node, expiresAt } = params
    const subflowId = asString(node.data.subflowId)?.trim()
    if (!subflowId) {
      await this.#failSession(session, 'SUBFLOW node missing subflowId')
      return { session, stop: true }
    }

    const targetFlow = await this.flows.findByIdForOrg({
      organizationId: session.organizationId,
      id: subflowId,
    })
    if (!targetFlow?.publishedVersionId) {
      await this.logs.insert({
        organizationId: session.organizationId,
        flowSessionId: session.id,
        conversationId: session.conversationId,
        nodeId: node.id,
        nodeType: node.type,
        actionTaken: 'SUBFLOW_MISSING',
        errorMessage: `Published subflow ${subflowId} not found`,
      })
      const updated =
        (await this.sessions.update({
          organizationId: session.organizationId,
          id: session.id,
          status: FlowSessionStatus.TERMINATED,
          lastInteractionAt: new Date(),
          expiresAt,
        })) ?? session
      return { session: updated, stop: true }
    }

    const targetVersion = await this.flows.findVersionById({
      organizationId: session.organizationId,
      id: targetFlow.publishedVersionId,
    })
    if (!targetVersion) {
      await this.#failSession(session, 'Subflow published version missing')
      return { session, stop: true }
    }

    const targetGraph = parseFlowGraph({
      nodes: targetVersion.nodes,
      edges: targetVersion.edges,
      viewport: targetVersion.viewport,
    })
    const trigger = targetGraph.nodes.find((item) => item.type === FlowNodeType.TRIGGER)
    if (!trigger) {
      await this.#failSession(session, 'Subflow has no TRIGGER')
      return { session, stop: true }
    }

    const nextStack = pushSubflowFrame(parseCallStack(session.callStack), {
      flowId: session.flowId,
      flowVersionId: session.flowVersionId,
      nodeId: node.id,
      variablesSnapshot: { ...session.variables },
      enteredAt: new Date().toISOString(),
    })
    if (!nextStack) {
      await this.logs.insert({
        organizationId: session.organizationId,
        flowSessionId: session.id,
        conversationId: session.conversationId,
        nodeId: node.id,
        nodeType: node.type,
        actionTaken: 'STACK_DEPTH_EXCEEDED',
        errorMessage: 'Max flow stack depth exceeded',
      })
      const updated =
        (await this.sessions.update({
          organizationId: session.organizationId,
          id: session.id,
          status: FlowSessionStatus.TERMINATED,
          lastInteractionAt: new Date(),
          expiresAt,
        })) ?? session
      return { session: updated, stop: true }
    }

    const passThrough = Boolean(node.data.inputVariablePassThrough)
    const variables = passThrough ? session.variables : {}

    await this.logs.insert({
      organizationId: session.organizationId,
      flowSessionId: session.id,
      conversationId: session.conversationId,
      nodeId: node.id,
      nodeType: node.type,
      actionTaken: 'ENTER_SUBFLOW',
      outputPayload: {
        subflowId,
        flowVersionId: targetVersion.id,
        nextNodeId: trigger.id,
      },
    })

    const updated =
      (await this.sessions.update({
        organizationId: session.organizationId,
        id: session.id,
        flowId: targetFlow.id,
        flowVersionId: targetVersion.id,
        currentNodeId: trigger.id,
        callStack: nextStack,
        variables,
        status: FlowSessionStatus.ACTIVE,
        lastInteractionAt: new Date(),
        expiresAt,
      })) ?? session
    return { session: updated, stop: false }
  }

  async #tryExitSubflow(params: {
    session: FlowSessionRow
    node: FlowNode
    expiresAt: Date
  }): Promise<{ session: FlowSessionRow; stop: boolean } | null> {
    const stack = parseCallStack(params.session.callStack)
    let callerIndex = -1
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i]?.kind === 'subflow') {
        callerIndex = i
        break
      }
    }
    if (callerIndex < 0) return null

    const callerFrame = stack[callerIndex]
    if (!callerFrame) return null

    return this.#returnToParentAfterSubflow({
      session: params.session,
      callerFrame,
      callStack: stack.slice(0, callerIndex),
      expiresAt: params.expiresAt,
      actionTaken: 'EXIT_SUBFLOW',
    })
  }

  async #returnToParentAfterSubflow(params: {
    session: FlowSessionRow
    callerFrame: {
      flowId: string
      flowVersionId: string
      nodeId: string
      variablesSnapshot: Record<string, unknown>
    }
    callStack: ReturnType<typeof parseCallStack>
    expiresAt: Date
    actionTaken: string
    replyId?: string | null
  }): Promise<{ session: FlowSessionRow; stop: boolean }> {
    const parentVersion = await this.flows.findVersionById({
      organizationId: params.session.organizationId,
      id: params.callerFrame.flowVersionId,
    })
    if (!parentVersion) {
      await this.#failSession(params.session, 'Parent flow version missing on subflow return')
      return { session: params.session, stop: true }
    }

    const parentGraph = parseFlowGraph({
      nodes: parentVersion.nodes,
      edges: parentVersion.edges,
      viewport: parentVersion.viewport,
    })
    const callerNode = parentGraph.nodes.find((item) => item.id === params.callerFrame.nodeId)
    const outgoing = parentGraph.edges.filter((edge) => edge.source === params.callerFrame.nodeId)
    const next = this.#unlabeledEdge(outgoing)
    const nextNodeId = next?.target ?? params.callerFrame.nodeId

    await this.logs.insert({
      organizationId: params.session.organizationId,
      flowSessionId: params.session.id,
      conversationId: params.session.conversationId,
      nodeId: params.session.currentNodeId,
      nodeType: callerNode?.type ?? FlowNodeType.SUBFLOW,
      actionTaken: params.actionTaken,
      inputPayload: params.replyId ? { interactiveReplyId: params.replyId } : null,
      outputPayload: { nextNodeId, parentFlowId: params.callerFrame.flowId },
    })

    const completed = !next
    const updated =
      (await this.sessions.update({
        organizationId: params.session.organizationId,
        id: params.session.id,
        flowId: params.callerFrame.flowId,
        flowVersionId: params.callerFrame.flowVersionId,
        currentNodeId: nextNodeId,
        callStack: params.callStack,
        variables: params.callerFrame.variablesSnapshot,
        status: completed ? FlowSessionStatus.COMPLETED : FlowSessionStatus.ACTIVE,
        lastInteractionAt: new Date(),
        expiresAt: params.expiresAt,
      })) ?? params.session

    return { session: updated, stop: completed }
  }
}

function visitKeyFrom(session: FlowSessionRow): string {
  const at = session.lastInteractionAt
  const ms = at instanceof Date ? at.getTime() : new Date(at).getTime()
  return Number.isFinite(ms) ? String(ms) : '0'
}
