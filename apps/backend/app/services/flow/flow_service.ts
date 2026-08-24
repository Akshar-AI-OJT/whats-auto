import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { FlowStatus } from '#enums/flow_status'
import { FlowTriggerType } from '#enums/flow_trigger_type'
import { FlowValidationStatus } from '#enums/flow_validation_status'
import FlowException from '#exceptions/flow_exception'
import {
  DEFAULT_FLOW_SETTINGS,
  DEFAULT_FLOW_VIEWPORT,
  parseFlowGraph,
  parseFlowSettings,
  parseTriggerConfig,
  type FlowGraph,
  type FlowGraphValidationError,
  type FlowSettings,
  type FlowTriggerConfig,
} from '#lib/flow/flow_graph'
import { validateFlowGraph, validateFlowTrigger } from '#lib/flow/flow_graph_validator'
import { FlowRepository } from '#repositories/flow_repository'
import { runWithTenant } from '#services/tenant_context'
import {
  transformFlowDetail,
  transformFlowSummary,
  type FlowDetailResponse,
  type FlowSummaryResponse,
} from '#transformers/flow_transformer'

type DbClient = typeof db | TransactionClientContract

export type FlowListResult = {
  data: FlowSummaryResponse[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

export type FlowValidateResult = {
  valid: boolean
  errors: FlowGraphValidationError[]
}

export default class FlowService {
  constructor(private flows: FlowRepository = new FlowRepository()) {}

  async list(params: {
    organizationId: string
    page?: number
    perPage?: number
    status?: string
    search?: string
  }): Promise<FlowListResult> {
    const page = params.page ?? 1
    const perPage = params.perPage ?? 20

    const { rows, total } = await runWithTenant(params.organizationId, () =>
      this.flows.listForOrg({
        organizationId: params.organizationId,
        page,
        perPage,
        status: params.status,
        search: params.search,
      })
    )

    return {
      data: rows.map(transformFlowSummary),
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage: Math.ceil(total / perPage) || 1,
      },
    }
  }

  async get(params: { organizationId: string; flowId: string }): Promise<FlowDetailResponse> {
    return runWithTenant(params.organizationId, async () => {
      const flow = await this.requireFlow(params.organizationId, params.flowId)
      const version = await this.requireLatestVersion(params.organizationId, flow.id)
      return transformFlowDetail(flow, version)
    })
  }

  async create(params: {
    organizationId: string
    actorUserId: string
    name: string
    description?: string | null
    triggerType?: string
    triggerConfig?: FlowTriggerConfig
    settings?: Partial<FlowSettings>
    isDefault?: boolean
  }): Promise<FlowDetailResponse> {
    return runWithTenant(params.organizationId, async () => {
      return db.transaction(async (trx) => {
        const settings = parseFlowSettings({
          ...DEFAULT_FLOW_SETTINGS,
          ...(params.settings ?? {}),
        })
        const triggerType = params.triggerType ?? FlowTriggerType.KEYWORD
        const triggerConfig = parseTriggerConfig(params.triggerConfig ?? {})

        const flow = await this.flows.insertFlow(
          {
            organizationId: params.organizationId,
            name: params.name,
            description: params.description ?? null,
            triggerType,
            triggerConfig,
            settings,
            isDefault: params.isDefault ?? false,
            createdByUserId: params.actorUserId,
          },
          trx
        )

        if (flow.isDefault) {
          await this.flows.clearDefaultExcept(
            { organizationId: params.organizationId, exceptFlowId: flow.id },
            trx
          )
        }

        const emptyGraph: FlowGraph = {
          nodes: [],
          edges: [],
          viewport: DEFAULT_FLOW_VIEWPORT,
        }
        const version = await this.flows.insertVersion(
          {
            organizationId: params.organizationId,
            flowId: flow.id,
            versionNumber: 1,
            graph: emptyGraph,
            validationStatus: FlowValidationStatus.INVALID,
            validationErrors: validateFlowGraph(emptyGraph, { flowId: flow.id }),
            createdByUserId: params.actorUserId,
          },
          trx
        )

        return transformFlowDetail(flow, version)
      })
    })
  }

  async update(params: {
    organizationId: string
    actorUserId: string
    flowId: string
    name?: string
    description?: string | null
    triggerType?: string
    triggerConfig?: FlowTriggerConfig
    settings?: Partial<FlowSettings>
    isDefault?: boolean
    nodes?: unknown[]
    edges?: unknown[]
    viewport?: FlowGraph['viewport']
  }): Promise<FlowDetailResponse> {
    return runWithTenant(params.organizationId, async () => {
      return db.transaction(async (trx) => {
        const existing = await this.requireFlow(params.organizationId, params.flowId, trx)
        if (existing.status === FlowStatus.ARCHIVED) {
          throw FlowException.archived()
        }

        let flow = existing
        const metaPatch: {
          name?: string
          description?: string | null
          triggerType?: string
          triggerConfig?: FlowTriggerConfig
          settings?: FlowSettings
          isDefault?: boolean
        } = {}

        if (params.name !== undefined) metaPatch.name = params.name
        if (params.description !== undefined) metaPatch.description = params.description
        if (params.triggerType !== undefined) metaPatch.triggerType = params.triggerType
        if (params.triggerConfig !== undefined) {
          metaPatch.triggerConfig = parseTriggerConfig(params.triggerConfig)
        }
        if (params.settings !== undefined) {
          metaPatch.settings = parseFlowSettings({
            ...parseFlowSettings(existing.settings),
            ...params.settings,
          })
        }
        if (params.isDefault !== undefined) metaPatch.isDefault = params.isDefault

        if (Object.keys(metaPatch).length > 0) {
          flow =
            (await this.flows.updateFlow(
              {
                organizationId: params.organizationId,
                id: params.flowId,
                ...metaPatch,
              },
              trx
            )) ?? existing

          if (metaPatch.isDefault === true) {
            await this.flows.clearDefaultExcept(
              { organizationId: params.organizationId, exceptFlowId: flow.id },
              trx
            )
          }
        }

        let version = await this.requireLatestVersion(params.organizationId, flow.id, trx)

        if (
          params.nodes !== undefined ||
          params.edges !== undefined ||
          params.viewport !== undefined
        ) {
          const currentGraph = parseFlowGraph({
            nodes: version.nodes,
            edges: version.edges,
            viewport: version.viewport,
          })
          const nextGraph = parseFlowGraph({
            nodes: params.nodes ?? currentGraph.nodes,
            edges: params.edges ?? currentGraph.edges,
            viewport: params.viewport ?? currentGraph.viewport,
          })

          const publishedSubflows = await this.flows.listPublishedSubflowTargets(
            params.organizationId,
            trx
          )
          const errors = this.collectValidationErrors({
            flow,
            graph: nextGraph,
            publishedSubflows,
          })
          const validationStatus =
            errors.length === 0 ? FlowValidationStatus.VALID : FlowValidationStatus.INVALID

          const shouldFork =
            flow.publishedVersionId !== null && version.id === flow.publishedVersionId

          if (shouldFork) {
            version = await this.flows.insertVersion(
              {
                organizationId: params.organizationId,
                flowId: flow.id,
                versionNumber: version.versionNumber + 1,
                graph: nextGraph,
                validationStatus,
                validationErrors: errors,
                createdByUserId: params.actorUserId,
              },
              trx
            )
          } else {
            version =
              (await this.flows.updateVersionGraph(
                {
                  organizationId: params.organizationId,
                  id: version.id,
                  graph: nextGraph,
                  validationStatus,
                  validationErrors: errors,
                },
                trx
              )) ?? version
          }

          flow =
            (await this.flows.updateFlow(
              {
                organizationId: params.organizationId,
                id: flow.id,
              },
              trx
            )) ?? flow
        }

        return transformFlowDetail(flow, version)
      })
    })
  }

  async validate(params: {
    organizationId: string
    flowId: string
    nodes?: unknown[]
    edges?: unknown[]
    viewport?: FlowGraph['viewport']
  }): Promise<FlowValidateResult> {
    return runWithTenant(params.organizationId, async () => {
      const flow = await this.requireFlow(params.organizationId, params.flowId)
      const version = await this.requireLatestVersion(params.organizationId, flow.id)
      const stored = parseFlowGraph({
        nodes: version.nodes,
        edges: version.edges,
        viewport: version.viewport,
      })
      const graph = parseFlowGraph({
        nodes: params.nodes ?? stored.nodes,
        edges: params.edges ?? stored.edges,
        viewport: params.viewport ?? stored.viewport,
      })
      const publishedSubflows = await this.flows.listPublishedSubflowTargets(params.organizationId)
      const errors = this.collectValidationErrors({ flow, graph, publishedSubflows })
      return { valid: errors.length === 0, errors }
    })
  }

  async publish(params: { organizationId: string; flowId: string }): Promise<FlowDetailResponse> {
    return runWithTenant(params.organizationId, async () => {
      return db.transaction(async (trx) => {
        const flow = await this.requireFlow(params.organizationId, params.flowId, trx)
        if (flow.status === FlowStatus.ARCHIVED) {
          throw FlowException.archived()
        }

        const version = await this.requireLatestVersion(params.organizationId, flow.id, trx)
        const graph = parseFlowGraph({
          nodes: version.nodes,
          edges: version.edges,
          viewport: version.viewport,
        })
        const publishedSubflows = await this.flows.listPublishedSubflowTargets(
          params.organizationId,
          trx
        )
        const errors = this.collectValidationErrors({ flow, graph, publishedSubflows })
        if (errors.length > 0) {
          await this.flows.updateVersionGraph(
            {
              organizationId: params.organizationId,
              id: version.id,
              graph,
              validationStatus: FlowValidationStatus.INVALID,
              validationErrors: errors,
            },
            trx
          )
          throw FlowException.invalidGraph(errors)
        }

        const updatedVersion =
          (await this.flows.updateVersionGraph(
            {
              organizationId: params.organizationId,
              id: version.id,
              graph,
              validationStatus: FlowValidationStatus.VALID,
              validationErrors: [],
            },
            trx
          )) ?? version

        const updatedFlow =
          (await this.flows.updateFlow(
            {
              organizationId: params.organizationId,
              id: flow.id,
              status: FlowStatus.PUBLISHED,
              publishedVersionId: updatedVersion.id,
            },
            trx
          )) ?? flow

        return transformFlowDetail(updatedFlow, updatedVersion)
      })
    })
  }

  async archive(params: { organizationId: string; flowId: string }): Promise<FlowDetailResponse> {
    return runWithTenant(params.organizationId, async () => {
      const flow = await this.requireFlow(params.organizationId, params.flowId)
      const version = await this.requireLatestVersion(params.organizationId, flow.id)
      if (flow.status === FlowStatus.ARCHIVED) {
        return transformFlowDetail(flow, version)
      }

      const updated =
        (await this.flows.updateFlow({
          organizationId: params.organizationId,
          id: params.flowId,
          status: FlowStatus.ARCHIVED,
          isDefault: false,
        })) ?? flow

      return transformFlowDetail(updated, version)
    })
  }

  private collectValidationErrors(params: {
    flow: { id: string; triggerType: string; triggerConfig: FlowTriggerConfig }
    graph: FlowGraph
    publishedSubflows: Map<string, string[]>
  }): FlowGraphValidationError[] {
    return [
      ...validateFlowTrigger(
        params.flow.triggerType,
        parseTriggerConfig(params.flow.triggerConfig)
      ),
      ...validateFlowGraph(params.graph, {
        flowId: params.flow.id,
        publishedSubflows: params.publishedSubflows,
      }),
    ]
  }

  private async requireFlow(organizationId: string, flowId: string, client: DbClient = db) {
    const flow = await this.flows.findByIdForOrg({ organizationId, id: flowId }, client)
    if (!flow) throw FlowException.notFound()
    return flow
  }

  private async requireLatestVersion(
    organizationId: string,
    flowId: string,
    client: DbClient = db
  ) {
    const version = await this.flows.findLatestVersion({ organizationId, flowId }, client)
    if (!version) throw FlowException.notFound()
    return version
  }
}
