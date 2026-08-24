import vine from '@vinejs/vine'
import { FLOW_STATUSES } from '#enums/flow_status'
import { FLOW_NODE_TYPES } from '#enums/flow_node_type'
import { FLOW_TRIGGER_TYPES } from '#enums/flow_trigger_type'
import { FLOW_EXPIRY_MODES, FLOW_TANGENT_RESUME_MODES } from '#lib/flow/flow_graph'

const flowNodeSchema = vine.object({
  id: vine.string().trim().minLength(1).maxLength(100),
  type: vine.enum(FLOW_NODE_TYPES),
  position: vine
    .object({
      x: vine.number(),
      y: vine.number(),
    })
    .optional(),
  data: vine.record(vine.any()).optional(),
})

const flowEdgeSchema = vine.object({
  id: vine.string().trim().minLength(1).maxLength(100),
  source: vine.string().trim().minLength(1).maxLength(100),
  target: vine.string().trim().minLength(1).maxLength(100),
  sourceHandle: vine.string().trim().maxLength(100).nullable().optional(),
  targetHandle: vine.string().trim().maxLength(100).nullable().optional(),
})

const flowViewportSchema = vine.object({
  x: vine.number(),
  y: vine.number(),
  zoom: vine.number().positive(),
})

const flowSettingsSchema = vine.object({
  sessionTtlMinutes: vine.number().withoutDecimals().min(1).max(10080).optional(),
  onExpiry: vine.enum(FLOW_EXPIRY_MODES).optional(),
  tangentResume: vine.enum(FLOW_TANGENT_RESUME_MODES).optional(),
})

const flowTriggerConfigSchema = vine.object({
  keywords: vine.array(vine.string().trim().minLength(1).maxLength(255)).optional(),
  matchType: vine.enum(['exact', 'contains', 'regex'] as const).optional(),
})

export const flowIdParamValidator = vine.create(
  vine.object({
    id: vine.string().trim().uuid(),
  })
)

export const listFlowsValidator = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).max(100).optional(),
    status: vine.enum(FLOW_STATUSES).optional(),
    search: vine.string().trim().maxLength(255).optional(),
  })
)

export const createFlowValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(255),
    description: vine.string().trim().maxLength(2000).nullable().optional(),
    triggerType: vine.enum(FLOW_TRIGGER_TYPES).optional(),
    triggerConfig: flowTriggerConfigSchema.optional(),
    settings: flowSettingsSchema.optional(),
    isDefault: vine.boolean().optional(),
  })
)

export const updateFlowValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(255).optional(),
    description: vine.string().trim().maxLength(2000).nullable().optional(),
    triggerType: vine.enum(FLOW_TRIGGER_TYPES).optional(),
    triggerConfig: flowTriggerConfigSchema.optional(),
    settings: flowSettingsSchema.optional(),
    isDefault: vine.boolean().optional(),
    nodes: vine.array(flowNodeSchema).optional(),
    edges: vine.array(flowEdgeSchema).optional(),
    viewport: flowViewportSchema.optional(),
  })
)

export const validateFlowValidator = vine.create(
  vine.object({
    nodes: vine.array(flowNodeSchema).optional(),
    edges: vine.array(flowEdgeSchema).optional(),
    viewport: flowViewportSchema.optional(),
  })
)
