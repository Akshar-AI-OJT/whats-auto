import type { HttpContext } from '@adonisjs/core/http'
import FlowPolicy from '#policies/flow_policy'
import FlowService from '#services/flow/flow_service'
import {
  createFlowValidator,
  flowIdParamValidator,
  listFlowsValidator,
  updateFlowValidator,
  validateFlowValidator,
} from '#validators/flow'
import '#types/http'

export default class FlowsController {
  /**
   * @index
   * @summary List conversation flows
   * @description Paginated flows for the active organization. Archived flows are omitted unless status=ARCHIVED.
   * @tag Flows
   * @security BearerAuth
   * @paramQuery page - Page number - @type(number)
   * @paramQuery perPage - Page size - @type(number)
   * @paramQuery status - Filter by status - @type(string)
   * @paramQuery search - Case-insensitive name search - @type(string)
   * @responseBody 200 - { "data": { "data": [{ "id": "uuid", "name": "Welcome", "status": "DRAFT" }], "meta": { "total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1 } } }
   * @responseBody 403 - { "error": "Permission denied: automations:view", "code": "PERMISSION_DENIED" }
   */
  async index({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(FlowPolicy).authorize('viewList')

    const params = await request.validateUsing(listFlowsValidator, {
      data: request.qs(),
    })

    const result = await new FlowService().list({
      organizationId: request.activeMember!.organizationId,
      page: params.page,
      perPage: params.perPage,
      status: params.status,
      search: params.search,
    })

    return serialize(result)
  }

  /**
   * @store
   * @summary Create a draft conversation flow
   * @description Creates a DRAFT flow with an empty version 1 graph. Trigger config lives on the flow row.
   * @tag Flows
   * @security BearerAuth
   * @requestBody { "name": "Welcome flow", "triggerType": "KEYWORD", "triggerConfig": { "keywords": ["hi"], "matchType": "exact" } }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Welcome flow", "status": "DRAFT", "version": { "versionNumber": 1 } } }
   * @responseBody 403 - { "error": "Permission denied: automations:create", "code": "PERMISSION_DENIED" }
   */
  async store({ bouncer, request, serialize }: HttpContext) {
    await bouncer.with(FlowPolicy).authorize('create')

    const payload = await request.validateUsing(createFlowValidator)
    const flow = await new FlowService().create({
      organizationId: request.activeMember!.organizationId,
      actorUserId: request.authUser!.id,
      name: payload.name,
      description: payload.description,
      triggerType: payload.triggerType,
      triggerConfig: payload.triggerConfig,
      settings: payload.settings,
      isDefault: payload.isDefault,
    })
    return serialize(flow)
  }

  /**
   * @show
   * @summary Get a conversation flow
   * @description Returns flow metadata plus the latest version graph.
   * @tag Flows
   * @security BearerAuth
   * @paramPath id - Flow id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Welcome flow", "status": "DRAFT", "version": { "versionNumber": 1, "nodes": [], "edges": [] } } }
   * @responseBody 404 - { "error": "Flow not found", "code": "E_FLOW_NOT_FOUND" }
   */
  async show({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(flowIdParamValidator, {
      data: params,
    })

    const flow = await new FlowService().get({
      organizationId: request.activeMember!.organizationId,
      flowId: id,
    })

    await bouncer.with(FlowPolicy).authorize('view', flow)
    return serialize(flow)
  }

  /**
   * @update
   * @summary Update a conversation flow
   * @description Updates metadata and/or the draft graph. Saving a published latest version forks a new version number.
   * @tag Flows
   * @security BearerAuth
   * @paramPath id - Flow id - @type(string)
   * @requestBody { "name": "Welcome v2", "nodes": [], "edges": [] }
   * @responseBody 200 - { "data": { "id": "uuid", "name": "Welcome v2", "version": { "versionNumber": 2 } } }
   * @responseBody 404 - { "error": "Flow not found", "code": "E_FLOW_NOT_FOUND" }
   */
  async update({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(flowIdParamValidator, {
      data: params,
    })

    const existing = await new FlowService().get({
      organizationId: request.activeMember!.organizationId,
      flowId: id,
    })
    await bouncer.with(FlowPolicy).authorize('update', existing)

    const payload = await request.validateUsing(updateFlowValidator)
    const flow = await new FlowService().update({
      organizationId: request.activeMember!.organizationId,
      actorUserId: request.authUser!.id,
      flowId: id,
      name: payload.name,
      description: payload.description,
      triggerType: payload.triggerType,
      triggerConfig: payload.triggerConfig,
      settings: payload.settings,
      isDefault: payload.isDefault,
      nodes: payload.nodes?.map((node) => ({
        ...node,
        data: node.data ?? {},
      })),
      edges: payload.edges,
      viewport: payload.viewport,
    })
    return serialize(flow)
  }

  /**
   * @validate
   * @summary Validate a conversation flow graph
   * @description Returns graph integrity errors without publishing. Optional body validates an unsaved graph.
   * @tag Flows
   * @security BearerAuth
   * @paramPath id - Flow id - @type(string)
   * @requestBody { "nodes": [], "edges": [] }
   * @responseBody 200 - { "data": { "valid": true, "errors": [] } }
   * @responseBody 404 - { "error": "Flow not found", "code": "E_FLOW_NOT_FOUND" }
   */
  async validate({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(flowIdParamValidator, {
      data: params,
    })

    const existing = await new FlowService().get({
      organizationId: request.activeMember!.organizationId,
      flowId: id,
    })
    await bouncer.with(FlowPolicy).authorize('view', existing)

    const payload = await request.validateUsing(validateFlowValidator)
    const result = await new FlowService().validate({
      organizationId: request.activeMember!.organizationId,
      flowId: id,
      nodes: payload.nodes?.map((node) => ({
        ...node,
        data: node.data ?? {},
      })),
      edges: payload.edges,
      viewport: payload.viewport,
    })
    return serialize(result)
  }

  /**
   * @publish
   * @summary Publish a conversation flow
   * @description Validates the latest version then sets publishedVersionId and status PUBLISHED.
   * @tag Flows
   * @security BearerAuth
   * @paramPath id - Flow id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "status": "PUBLISHED", "publishedVersionId": "uuid" } }
   * @responseBody 422 - { "error": "Flow graph is invalid", "code": "E_FLOW_INVALID", "errors": [{ "code": "TRIGGER_COUNT", "message": "Graph must contain exactly one TRIGGER node" }] }
   * @responseBody 404 - { "error": "Flow not found", "code": "E_FLOW_NOT_FOUND" }
   */
  async publish({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(flowIdParamValidator, {
      data: params,
    })

    const existing = await new FlowService().get({
      organizationId: request.activeMember!.organizationId,
      flowId: id,
    })
    await bouncer.with(FlowPolicy).authorize('publish', existing)

    const flow = await new FlowService().publish({
      organizationId: request.activeMember!.organizationId,
      flowId: id,
    })
    return serialize(flow)
  }

  /**
   * @destroy
   * @summary Archive a conversation flow
   * @description Soft-archives the flow (status ARCHIVED). Does not hard-delete versions or sessions.
   * @tag Flows
   * @security BearerAuth
   * @paramPath id - Flow id - @type(string)
   * @responseBody 200 - { "data": { "id": "uuid", "status": "ARCHIVED" } }
   * @responseBody 404 - { "error": "Flow not found", "code": "E_FLOW_NOT_FOUND" }
   */
  async destroy({ bouncer, request, params, serialize }: HttpContext) {
    const { id } = await request.validateUsing(flowIdParamValidator, {
      data: params,
    })

    const existing = await new FlowService().get({
      organizationId: request.activeMember!.organizationId,
      flowId: id,
    })
    await bouncer.with(FlowPolicy).authorize('destroy', existing)

    const flow = await new FlowService().archive({
      organizationId: request.activeMember!.organizationId,
      flowId: id,
    })
    return serialize(flow)
  }
}
