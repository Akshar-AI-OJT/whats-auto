import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { CatalogStatus } from '#enums/catalog_status'
import { FlowStatus } from '#enums/flow_status'
import { FlowTriggerType } from '#enums/flow_trigger_type'
import { FlowValidationStatus } from '#enums/flow_validation_status'
import PlatformCatalogException from '#exceptions/platform_catalog_exception'
import {
  DEFAULT_FLOW_SETTINGS,
  DEFAULT_FLOW_VIEWPORT,
  extractSubflowIds,
  extractTemplateIds,
  parseFlowGraph,
  parseFlowSettings,
  parseTriggerConfig,
  type FlowGraph,
  type FlowGraphValidationError,
  type FlowSettings,
  type FlowTriggerConfig,
} from '#lib/flow/flow_graph'
import {
  deriveRequiredFeatureKeys,
  mergeRequiredFeatureKeys,
} from '#lib/flow/flow_required_features'
import { validateFlowGraph, validateFlowTrigger } from '#lib/flow/flow_graph_validator'
import { FlowRepository } from '#repositories/flow_repository'
import {
  PlatformFlowCatalogRepository,
  type PlatformFlowCatalogRow,
} from '#repositories/platform_flow_catalog_repository'
import { PlatformTemplateCatalogRepository } from '#repositories/platform_template_catalog_repository'
import { EntitlementService } from '#services/billing/entitlement_service'
import { PlatformTemplateCatalogService } from '#services/platform_template_catalog_service'
import { runWithTenant } from '#services/tenant_context'
import {
  transformFlowDetail,
  type FlowDetailResponse,
} from '#transformers/flow_transformer'
import {
  transformPlatformFlowCatalogDetail,
  transformPlatformFlowCatalogSummary,
  type PlatformFlowCatalogDetail,
} from '#transformers/platform_flow_catalog_transformer'

type DbClient = typeof db | TransactionClientContract

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return slug || 'flow'
}

export class PlatformFlowCatalogService {
  constructor(
    private catalog: PlatformFlowCatalogRepository = new PlatformFlowCatalogRepository(),
    private templates: PlatformTemplateCatalogRepository = new PlatformTemplateCatalogRepository(),
    private templateInstall: PlatformTemplateCatalogService = new PlatformTemplateCatalogService(),
    private flows: FlowRepository = new FlowRepository(),
    private entitlements: EntitlementService = new EntitlementService()
  ) {}

  async list(params: {
    page?: number
    perPage?: number
    search?: string
    status?: string
    publishedOnly?: boolean
  }) {
    const result = await this.catalog.list(params)
    return {
      data: result.rows.map(transformPlatformFlowCatalogSummary),
      meta: {
        total: result.total,
        perPage: result.perPage,
        currentPage: result.page,
        lastPage: result.lastPage,
      },
    }
  }

  async listForOrganization(params: {
    organizationId: string
    page?: number
    perPage?: number
    search?: string
  }) {
    const page = params.page ?? 1
    const perPage = params.perPage ?? 20
    const orgFeatures = new Set(await this.entitlements.listEnabledFeatureKeys(params.organizationId))
    const published = await this.catalog.listPublished()
    const visible = published.filter((row) => {
      if (params.search) {
        const term = params.search.toLowerCase()
        const hay = `${row.name} ${row.slug} ${row.description ?? ''}`.toLowerCase()
        if (!hay.includes(term)) return false
      }
      return this.#orgCanUse(row, orgFeatures)
    })
    const total = visible.length
    const slice = visible.slice((page - 1) * perPage, page * perPage)
    return {
      data: slice.map(transformPlatformFlowCatalogSummary),
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage: Math.ceil(total / perPage) || 1,
      },
    }
  }

  async getById(id: string, publishedOnly = false): Promise<PlatformFlowCatalogDetail> {
    const row = await this.requireRow(id)
    if (publishedOnly && row.status !== CatalogStatus.PUBLISHED) {
      throw PlatformCatalogException.flowNotFound()
    }
    const version = await this.requireLatestVersion(id)
    return transformPlatformFlowCatalogDetail(row, version)
  }

  async create(params: {
    actorUserId: string
    name: string
    description?: string | null
    triggerType?: string
    triggerConfig?: FlowTriggerConfig
    settings?: Partial<FlowSettings>
    extraRequiredFeatureKeys?: string[]
    slug?: string
  }): Promise<PlatformFlowCatalogDetail> {
    let slug = slugify(params.slug?.trim() || params.name)
    if (await this.catalog.findBySlug(slug)) {
      slug = `${slug}_${Date.now().toString(36)}`
    }

    const settings = parseFlowSettings({
      ...DEFAULT_FLOW_SETTINGS,
      ...(params.settings ?? {}),
    })
    const triggerType = params.triggerType ?? FlowTriggerType.KEYWORD
    const triggerConfig = parseTriggerConfig(params.triggerConfig ?? {})
    const extra = params.extraRequiredFeatureKeys ?? []
    const emptyGraph: FlowGraph = { nodes: [], edges: [], viewport: DEFAULT_FLOW_VIEWPORT }
    const requiredFeatureKeys = mergeRequiredFeatureKeys(
      deriveRequiredFeatureKeys(emptyGraph),
      extra
    )

    return db.transaction(async (trx) => {
      const row = await this.catalog.insert(
        {
          slug,
          name: params.name,
          description: params.description ?? null,
          triggerType,
          triggerConfig,
          settings,
          requiredFeatureKeys,
          extraRequiredFeatureKeys: extra,
          createdByUserId: params.actorUserId,
        },
        trx
      )
      const version = await this.catalog.insertVersion(
        {
          flowCatalogId: row.id,
          versionNumber: 1,
          graph: emptyGraph,
          validationStatus: FlowValidationStatus.INVALID,
          validationErrors: validateFlowTrigger(triggerType, triggerConfig),
          createdByUserId: params.actorUserId,
        },
        trx
      )
      return transformPlatformFlowCatalogDetail(row, version)
    })
  }

  async update(params: {
    id: string
    actorUserId: string
    name?: string
    description?: string | null
    triggerType?: string
    triggerConfig?: FlowTriggerConfig
    settings?: Partial<FlowSettings>
    extraRequiredFeatureKeys?: string[]
    sortOrder?: number
    nodes?: unknown[]
    edges?: unknown[]
    viewport?: FlowGraph['viewport']
  }): Promise<PlatformFlowCatalogDetail> {
    const existing = await this.requireRow(params.id)
    if (existing.status === CatalogStatus.ARCHIVED) {
      throw PlatformCatalogException.archived()
    }

    return db.transaction(async (trx) => {
      let row = existing
      const metaPatch: Record<string, unknown> = { updatedByUserId: params.actorUserId }
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
      if (params.sortOrder !== undefined) metaPatch.sortOrder = params.sortOrder
      if (params.extraRequiredFeatureKeys !== undefined) {
        metaPatch.extraRequiredFeatureKeys = params.extraRequiredFeatureKeys
      }

      if (Object.keys(metaPatch).length > 1) {
        row = (await this.catalog.update(params.id, metaPatch, trx)) ?? existing
      }

      let version = await this.requireLatestVersion(params.id, trx)
      const hasGraphPatch =
        params.nodes !== undefined || params.edges !== undefined || params.viewport !== undefined

      if (hasGraphPatch) {
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
        const errors = await this.collectValidationErrors(row, nextGraph, trx)
        const validationStatus =
          errors.length === 0 ? FlowValidationStatus.VALID : FlowValidationStatus.INVALID
        const extra = params.extraRequiredFeatureKeys ?? row.extraRequiredFeatureKeys
        const requiredFeatureKeys = mergeRequiredFeatureKeys(
          deriveRequiredFeatureKeys(nextGraph),
          extra
        )

        const shouldFork =
          row.publishedVersionId !== null && version.id === row.publishedVersionId

        if (shouldFork) {
          version = await this.catalog.insertVersion(
            {
              flowCatalogId: row.id,
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
            (await this.catalog.updateVersionGraph(
              {
                id: version.id,
                graph: nextGraph,
                validationStatus,
                validationErrors: errors,
              },
              trx
            )) ?? version
        }

        row =
          (await this.catalog.update(
            row.id,
            {
              requiredFeatureKeys,
              extraRequiredFeatureKeys: extra,
              updatedByUserId: params.actorUserId,
            },
            trx
          )) ?? row
      } else if (params.extraRequiredFeatureKeys !== undefined) {
        const currentGraph = parseFlowGraph({
          nodes: version.nodes,
          edges: version.edges,
          viewport: version.viewport,
        })
        row =
          (await this.catalog.update(
            row.id,
            {
              requiredFeatureKeys: mergeRequiredFeatureKeys(
                deriveRequiredFeatureKeys(currentGraph),
                params.extraRequiredFeatureKeys
              ),
              extraRequiredFeatureKeys: params.extraRequiredFeatureKeys,
              updatedByUserId: params.actorUserId,
            },
            trx
          )) ?? row
      }

      return transformPlatformFlowCatalogDetail(row, version)
    })
  }

  async validate(params: {
    id: string
    nodes?: unknown[]
    edges?: unknown[]
    viewport?: FlowGraph['viewport']
  }) {
    const row = await this.requireRow(params.id)
    const version = await this.requireLatestVersion(params.id)
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
    const errors = await this.collectValidationErrors(row, graph)
    return { valid: errors.length === 0, errors }
  }

  async publish(id: string, actorUserId: string): Promise<PlatformFlowCatalogDetail> {
    const existing = await this.requireRow(id)
    if (existing.status === CatalogStatus.ARCHIVED) {
      throw PlatformCatalogException.archived()
    }

    return db.transaction(async (trx) => {
      const version = await this.requireLatestVersion(id, trx)
      const graph = parseFlowGraph({
        nodes: version.nodes,
        edges: version.edges,
        viewport: version.viewport,
      })
      const rowForValidation = { ...existing, id }
      const errors = await this.collectValidationErrors(rowForValidation, graph, trx)
      if (errors.length > 0) {
        await this.catalog.updateVersionGraph(
          {
            id: version.id,
            graph,
            validationStatus: FlowValidationStatus.INVALID,
            validationErrors: errors,
          },
          trx
        )
        throw PlatformCatalogException.invalidGraph(errors)
      }

      const updatedVersion =
        (await this.catalog.updateVersionGraph(
          {
            id: version.id,
            graph,
            validationStatus: FlowValidationStatus.VALID,
            validationErrors: [],
          },
          trx
        )) ?? version

      const extra = existing.extraRequiredFeatureKeys
      const row =
        (await this.catalog.update(
          id,
          {
            status: CatalogStatus.PUBLISHED,
            publishedVersionId: updatedVersion.id,
            requiredFeatureKeys: mergeRequiredFeatureKeys(deriveRequiredFeatureKeys(graph), extra),
            updatedByUserId: actorUserId,
          },
          trx
        )) ?? existing

      return transformPlatformFlowCatalogDetail(row, updatedVersion)
    })
  }

  async archive(id: string, actorUserId: string): Promise<PlatformFlowCatalogDetail> {
    const row = await this.catalog.update(id, {
      status: CatalogStatus.ARCHIVED,
      updatedByUserId: actorUserId,
    })
    if (!row) throw PlatformCatalogException.flowNotFound()
    const version = await this.requireLatestVersion(id)
    return transformPlatformFlowCatalogDetail(row, version)
  }

  async installForOrganization(params: {
    catalogId: string
    organizationId: string
    userId?: string
  }): Promise<FlowDetailResponse> {
    const orgFeatures = new Set(await this.entitlements.listEnabledFeatureKeys(params.organizationId))
    const root = await this.requireRow(params.catalogId)
    if (root.status !== CatalogStatus.PUBLISHED || !this.#orgCanUse(root, orgFeatures)) {
      throw PlatformCatalogException.flowNotFound()
    }

    return runWithTenant(params.organizationId, () =>
      this.#installCatalogFlow({
        catalogId: params.catalogId,
        organizationId: params.organizationId,
        userId: params.userId,
        memo: new Map(),
        installing: new Set(),
      })
    )
  }

  async requireRow(id: string): Promise<PlatformFlowCatalogRow> {
    const row = await this.catalog.findById(id)
    if (!row) throw PlatformCatalogException.flowNotFound()
    return row
  }

  #orgCanUse(row: PlatformFlowCatalogRow, orgFeatures: Set<string>): boolean {
    const required = mergeRequiredFeatureKeys(row.requiredFeatureKeys, row.extraRequiredFeatureKeys)
    return required.every((key) => orgFeatures.has(key))
  }

  async requireLatestVersion(id: string, client: DbClient = db) {
    const version = await this.catalog.findLatestVersion(id, client)
    if (!version) throw PlatformCatalogException.flowNotFound()
    return version
  }

  private async collectValidationErrors(
    flow: { id: string; triggerType: string; triggerConfig: FlowTriggerConfig },
    graph: FlowGraph,
    client: DbClient = db
  ): Promise<FlowGraphValidationError[]> {
    const publishedSubflows = await this.catalog.listPublishedSubflowTargets(client)
    const publishedCatalogTemplateIds = await this.templates.listPublishedIds(client)
    return [
      ...validateFlowTrigger(flow.triggerType, parseTriggerConfig(flow.triggerConfig)),
      ...validateFlowGraph(graph, {
        flowId: flow.id,
        catalogMode: true,
        publishedSubflows,
        publishedCatalogTemplateIds,
      }),
    ]
  }

  async #installCatalogFlow(params: {
    catalogId: string
    organizationId: string
    userId?: string
    memo: Map<string, FlowDetailResponse>
    installing: Set<string>
  }): Promise<FlowDetailResponse> {
    const cached = params.memo.get(params.catalogId)
    if (cached) return cached
    if (params.installing.has(params.catalogId)) {
      throw PlatformCatalogException.subflowCycle()
    }

    const existing = await this.flows.findByCatalogFlowId({
      organizationId: params.organizationId,
      catalogFlowId: params.catalogId,
    })
    if (existing) {
      const version = await this.flows.findLatestVersion({
        organizationId: params.organizationId,
        flowId: existing.id,
      })
      if (!version) throw PlatformCatalogException.flowNotFound()
      const detail = transformFlowDetail(existing, version)
      params.memo.set(params.catalogId, detail)
      return detail
    }

    const catalog = await this.catalog.findById(params.catalogId)
    if (!catalog || catalog.status !== CatalogStatus.PUBLISHED) {
      throw PlatformCatalogException.flowNotFound()
    }

    const publishedVersion = catalog.publishedVersionId
      ? await this.catalog.findVersionById(catalog.publishedVersionId)
      : await this.catalog.findLatestVersion(params.catalogId)
    if (!publishedVersion) throw PlatformCatalogException.flowNotFound()

    const graph = parseFlowGraph({
      nodes: publishedVersion.nodes,
      edges: publishedVersion.edges,
      viewport: publishedVersion.viewport,
    })

    params.installing.add(params.catalogId)

    const templateMap = new Map<string, string>()
    for (const catalogTemplateId of [...new Set(extractTemplateIds(graph))]) {
      const installed = await this.templateInstall.installForOrganization({
        catalogId: catalogTemplateId,
        organizationId: params.organizationId,
        userId: params.userId,
      })
      templateMap.set(catalogTemplateId, installed.id)
    }

    const subflowMap = new Map<string, string>()
    for (const catalogSubflowId of [...new Set(extractSubflowIds(graph))]) {
      const child = await this.#installCatalogFlow({
        ...params,
        catalogId: catalogSubflowId,
      })
      subflowMap.set(catalogSubflowId, child.id)
    }

    params.installing.delete(params.catalogId)

    const remapped: FlowGraph = {
      ...graph,
      nodes: graph.nodes.map((node) => {
        if (node.type === 'TEMPLATE') {
          const from = String(node.data.messageTemplateId ?? '')
          const to = templateMap.get(from)
          return to ? { ...node, data: { ...node.data, messageTemplateId: to } } : node
        }
        if (node.type === 'SUBFLOW') {
          const from = String(node.data.subflowId ?? '')
          const to = subflowMap.get(from)
          return to ? { ...node, data: { ...node.data, subflowId: to } } : node
        }
        return node
      }),
    }

    const flow = await this.flows.insertFlow(
      {
        organizationId: params.organizationId,
        name: catalog.name,
        description: catalog.description,
        status: FlowStatus.DRAFT,
        isDefault: false,
        triggerType: catalog.triggerType,
        triggerConfig: parseTriggerConfig(catalog.triggerConfig),
        settings: parseFlowSettings(catalog.settings),
        catalogFlowId: catalog.id,
        createdByUserId: params.userId ?? null,
      }
    )

    const version = await this.flows.insertVersion({
      organizationId: params.organizationId,
      flowId: flow.id,
      versionNumber: 1,
      graph: remapped,
      validationStatus: FlowValidationStatus.VALID,
      validationErrors: [],
      createdByUserId: params.userId ?? null,
    })

    const detail = transformFlowDetail(flow, version)
    params.memo.set(params.catalogId, detail)
    return detail
  }
}
