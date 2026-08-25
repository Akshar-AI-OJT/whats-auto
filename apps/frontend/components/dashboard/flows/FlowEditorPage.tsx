'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  applyEdgeChanges,
  applyNodeChanges,
  type OnEdgesChange,
  type OnNodesChange,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  api,
  type ApiError,
  type ConversationFlowKeywordMatchType,
  type ConversationFlowSettings,
  type ConversationFlowTriggerType,
  type ConversationFlowValidationError,
  type UpdateConversationFlowBody,
  type WhatsappMessageTemplate,
} from '@/lib/api'
import { hasPermission, PERMISSIONS } from '@/lib/rbac'
import { useOrganizations } from '@/components/dashboard/OrganizationsProvider'
import { Button } from '@/components/ui/button'
import { queryKeys } from '@/lib/query-keys'
import { unwrapTemplateList } from '@/components/dashboard/templates/template-utils'
import { FlowCanvas } from './FlowCanvas'
import { FlowNodeInspector } from './FlowNodeInspector'
import { FlowSettingsPanel } from './FlowSettingsPanel'
import { FlowSidebarPalette } from './FlowSidebarPalette'
import { FlowToolbar } from './FlowToolbar'
import { FlowEditorProvider } from './flow-editor-context'
import {
  DEFAULT_FLOW_SETTINGS,
  DEFAULT_VIEWPORT,
  createFlowNode,
  graphToRf,
  remapSourceHandle,
  dropSourceHandles,
  rfToGraph,
  type FlowCanvasNodeType,
  type FlowRfEdge,
  type FlowRfNode,
} from './flow-canvas-graph'
import {
  parseKeywordList,
  unwrapFlow,
  unwrapFlowList,
  unwrapFlowValidate,
  validationStateFromVersion,
  type FlowValidationState,
} from './flow-utils'

export function FlowEditorPage({ flowId }: { flowId: string }) {
  const t = useTranslations('dashboard.flows')
  const queryClient = useQueryClient()
  const { tenantOrganizationId, permissions, isLoading: orgsLoading } = useOrganizations()

  const canView = hasPermission(permissions, PERMISSIONS.AUTOMATIONS_VIEW)
  const canEdit = hasPermission(permissions, PERMISSIONS.AUTOMATIONS_EDIT)
  const canPublish = hasPermission(permissions, PERMISSIONS.AUTOMATIONS_TOGGLE)
  const canViewTemplates = hasPermission(permissions, PERMISSIONS.TEMPLATES_VIEW)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState<ConversationFlowTriggerType>('KEYWORD')
  const [keywords, setKeywords] = useState('')
  const [matchType, setMatchType] = useState<ConversationFlowKeywordMatchType>('exact')
  const [settings, setSettings] = useState<ConversationFlowSettings>(DEFAULT_FLOW_SETTINGS)
  const [nodes, setNodes] = useState<FlowRfNode[]>([])
  const [edges, setEdges] = useState<FlowRfEdge[]>([])
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [hydratedKey, setHydratedKey] = useState<string | null>(null)
  const [status, setStatus] = useState('DRAFT')
  const [actionError, setActionError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<ConversationFlowValidationError[]>([])
  const [validationState, setValidationState] = useState<FlowValidationState>('unknown')
  const reactFlowRef = useRef<ReactFlowInstance<FlowRfNode, FlowRfEdge> | null>(null)

  const detailQuery = useQuery({
    queryKey: queryKeys.flows.detail(tenantOrganizationId, flowId),
    enabled: Boolean(tenantOrganizationId) && canView && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.flows.get(flowId)
      return unwrapFlow(data)
    },
  })

  const templatesQuery = useQuery({
    queryKey: [...queryKeys.templates.all, 'flow-editor', tenantOrganizationId],
    enabled: Boolean(tenantOrganizationId) && canViewTemplates && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.whatsapp.listTemplates({ perPage: 100, status: 'approved' })
      return unwrapTemplateList(data).items
    },
  })

  const publishedFlowsQuery = useQuery({
    queryKey: queryKeys.flows.list(tenantOrganizationId, { status: 'PUBLISHED', perPage: 100 }),
    enabled: Boolean(tenantOrganizationId) && canView && !orgsLoading,
    queryFn: async () => {
      const { data } = await api.flows.list({ status: 'PUBLISHED', perPage: 100 })
      return unwrapFlowList(data).items.filter((flow) => flow.id !== flowId)
    },
  })

  const flow = detailQuery.data
  const sourceKey = flow ? `${flow.updatedAt}:${flow.version?.id ?? 'none'}` : null
  if (flow && sourceKey && sourceKey !== hydratedKey && !dirty) {
    const version = flow.version
    const graph = graphToRf({
      nodes: version?.nodes,
      edges: version?.edges,
    })
    setHydratedKey(sourceKey)
    setName(flow.name)
    setDescription(flow.description ?? '')
    setTriggerType(
      (['KEYWORD', 'INBOUND_ANY', 'CAMPAIGN_REPLY', 'SUBFLOW_ENTRY'].includes(flow.triggerType)
        ? flow.triggerType
        : 'KEYWORD') as ConversationFlowTriggerType
    )
    setKeywords((flow.triggerConfig?.keywords ?? []).join(', '))
    setMatchType(flow.triggerConfig?.matchType ?? 'exact')
    setSettings({
      sessionTtlMinutes:
        flow.settings?.sessionTtlMinutes ?? DEFAULT_FLOW_SETTINGS.sessionTtlMinutes,
      onExpiry: flow.settings?.onExpiry ?? DEFAULT_FLOW_SETTINGS.onExpiry,
      tangentResume: flow.settings?.tangentResume ?? DEFAULT_FLOW_SETTINGS.tangentResume,
      handoverKeywords: flow.settings?.handoverKeywords ?? DEFAULT_FLOW_SETTINGS.handoverKeywords,
    })
    setNodes(graph.nodes)
    setEdges(graph.edges)
    setViewport(version?.viewport ?? DEFAULT_VIEWPORT)
    setStatus(flow.status)
    const hydratedValidation = validationStateFromVersion(version)
    setValidationState(hydratedValidation.state)
    setValidationErrors(hydratedValidation.errors)
  }

  const readOnly = status === 'ARCHIVED' || !canEdit
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedId) ?? null,
    [nodes, selectedId]
  )
  const templatesById = useMemo(() => {
    const map = new Map<string, WhatsappMessageTemplate>()
    for (const item of templatesQuery.data ?? []) {
      map.set(item.id, item)
    }
    return map
  }, [templatesQuery.data])
  const publishedFlowsById = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const item of publishedFlowsQuery.data ?? []) {
      map.set(item.id, { id: item.id, name: item.name })
    }
    return map
  }, [publishedFlowsQuery.data])
  const markDirty = useCallback(() => {
    setDirty(true)
    setActionError(null)
    setValidationState('unknown')
    setValidationErrors([])
  }, [])

  const patchNodeDataById = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      if (readOnly) return
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node
        )
      )
      markDirty()
    },
    [markDirty, readOnly]
  )

  const renameHandleById = useCallback(
    (nodeId: string, oldId: string, nextId: string) => {
      if (readOnly || !oldId || oldId === nextId) return
      setEdges((current) => remapSourceHandle(current, nodeId, oldId, nextId))
      markDirty()
    },
    [markDirty, readOnly]
  )

  const removeHandlesById = useCallback(
    (nodeId: string, handleIds: string[]) => {
      if (readOnly || handleIds.length === 0) return
      setEdges((current) => dropSourceHandles(current, nodeId, handleIds))
      markDirty()
    },
    [markDirty, readOnly]
  )

  const deleteNodeById = useCallback(
    (nodeId: string) => {
      if (readOnly) return
      const target = nodes.find((node) => node.id === nodeId)
      if (!target || target.type === 'TRIGGER') return
      setNodes((current) => current.filter((node) => node.id !== nodeId))
      setEdges((current) =>
        current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      )
      if (selectedId === nodeId) setSelectedId(null)
      markDirty()
    },
    [markDirty, nodes, readOnly, selectedId]
  )

  const patchTriggerKeywords = useCallback(
    (next: string[]) => {
      if (readOnly) return
      setKeywords(next.join(', '))
      markDirty()
    },
    [markDirty, readOnly]
  )

  const editorContextValue = useMemo(
    () => ({
      triggerType,
      triggerKeywords: parseKeywordList(keywords),
      templatesById,
      publishedFlowsById,
      readOnly,
      patchNodeData: patchNodeDataById,
      renameHandle: renameHandleById,
      removeHandles: removeHandlesById,
      deleteNode: deleteNodeById,
      patchTriggerKeywords,
    }),
    [
      deleteNodeById,
      keywords,
      patchNodeDataById,
      patchTriggerKeywords,
      publishedFlowsById,
      readOnly,
      removeHandlesById,
      renameHandleById,
      templatesById,
      triggerType,
    ]
  )

  const applyValidationResult = useCallback(
    (result: { valid: boolean; errors: ConversationFlowValidationError[] }) => {
      setValidationErrors(result.errors)
      setValidationState(result.valid ? 'valid' : 'invalid')
      setActionError(result.valid ? null : t('errors.publishInvalid'))
    },
    [t]
  )

  const focusValidationNode = useCallback(
    (nodeId: string | undefined) => {
      if (!nodeId) return
      setSelectedId(nodeId)
      setSettingsOpen(false)
      const node = nodes.find((item) => item.id === nodeId)
      const instance = reactFlowRef.current
      if (!node || !instance) return
      const width = typeof node.measured?.width === 'number' ? node.measured.width : 280
      const height = typeof node.measured?.height === 'number' ? node.measured.height : 80
      instance.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: Math.max(instance.getZoom(), 0.85),
        duration: 220,
      })
    },
    [nodes]
  )

  const onNodesChange: OnNodesChange<FlowRfNode> = useCallback(
    (changes) => {
      if (readOnly) return
      const filtered = changes.filter((change) => {
        if (change.type !== 'remove') return true
        const node = nodes.find((item) => item.id === change.id)
        return node?.type !== 'TRIGGER'
      })
      if (filtered.length === 0) return
      setNodes((current) => applyNodeChanges(filtered, current))
      const structural = filtered.some((change) => change.type !== 'select')
      if (structural) markDirty()
      for (const change of filtered) {
        if (change.type === 'remove' && change.id === selectedId) setSelectedId(null)
      }
    },
    [markDirty, nodes, readOnly, selectedId]
  )

  const onEdgesChange: OnEdgesChange<FlowRfEdge> = useCallback(
    (changes) => {
      if (readOnly) return
      setEdges((current) => applyEdgeChanges(changes, current))
      const structural = changes.some((change) => change.type !== 'select')
      if (structural) markDirty()
    },
    [markDirty, readOnly]
  )

  const buildBody = useCallback((): UpdateConversationFlowBody => {
    const graph = rfToGraph(nodes, edges, {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
    })
    return {
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      triggerType,
      triggerConfig:
        triggerType === 'KEYWORD' ? { keywords: parseKeywordList(keywords), matchType } : {},
      settings,
      nodes: graph.nodes,
      edges: graph.edges,
      viewport: graph.viewport,
    }
  }, [
    description,
    edges,
    keywords,
    matchType,
    name,
    nodes,
    settings,
    triggerType,
    viewport.x,
    viewport.y,
    viewport.zoom,
  ])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.flows.update(flowId, buildBody())
      return unwrapFlow(data)
    },
    onSuccess: async (flow) => {
      setDirty(false)
      if (flow) {
        setStatus(flow.status)
        // PATCH already runs graph validation and persists version.validationStatus.
        const hydrated = validationStateFromVersion(flow.version)
        setValidationState(hydrated.state)
        setValidationErrors(hydrated.errors)
        setActionError(hydrated.state === 'invalid' ? t('errors.publishInvalid') : null)
      } else {
        setActionError(null)
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.flows.all })
      setHydratedKey(null)
    },
    onError: (err) => {
      setActionError((err as unknown as ApiError).message || t('editor.errors.saveFailed'))
    },
  })

  const validateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.flows.validate(flowId, buildBody())
      return unwrapFlowValidate(data)
    },
    onSuccess: (result) => {
      applyValidationResult(result)
    },
    onError: (err) => {
      setActionError((err as unknown as ApiError).message || t('editor.errors.validateFailed'))
    },
  })

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (dirty) {
        const { data } = await api.flows.update(flowId, buildBody())
        unwrapFlow(data)
      }
      const { data: validateData } = await api.flows.validate(flowId)
      const result = unwrapFlowValidate(validateData)
      if (!result.valid) {
        const error = new Error(t('errors.publishInvalid')) as Error & {
          validationErrors: ConversationFlowValidationError[]
        }
        error.validationErrors = result.errors
        throw error
      }
      const { data } = await api.flows.publish(flowId)
      return unwrapFlow(data)
    },
    onSuccess: async (flow) => {
      setDirty(false)
      setValidationErrors([])
      setValidationState('valid')
      setActionError(null)
      if (flow) setStatus(flow.status)
      await queryClient.invalidateQueries({ queryKey: queryKeys.flows.all })
      setHydratedKey(null)
    },
    onError: (err) => {
      const withErrors = err as { validationErrors?: ConversationFlowValidationError[] }
      if (withErrors.validationErrors?.length) {
        applyValidationResult({ valid: false, errors: withErrors.validationErrors })
        return
      }
      setActionError((err as unknown as ApiError).message || t('errors.publishFailed'))
    },
  })

  function addNode(type: Exclude<FlowCanvasNodeType, 'TRIGGER'>) {
    if (readOnly) return
    const offset = nodes.length * 28
    const node = createFlowNode(type, { x: 280 + offset, y: 120 + offset })
    setNodes((current) => [...current, node])
    setSelectedId(node.id)
    setSettingsOpen(false)
    markDirty()
  }

  function patchSelectedData(patch: Record<string, unknown>) {
    if (!selectedId || readOnly) return
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedId ? { ...node, data: { ...node.data, ...patch } } : node
      )
    )
    markDirty()
  }

  function renameSelectedHandle(oldId: string, nextId: string) {
    if (!selectedId || readOnly || !oldId || oldId === nextId) return
    setEdges((current) => remapSourceHandle(current, selectedId, oldId, nextId))
    markDirty()
  }

  function removeSelectedHandles(handleIds: string[]) {
    if (!selectedId || readOnly || handleIds.length === 0) return
    setEdges((current) => dropSourceHandles(current, selectedId, handleIds))
    markDirty()
  }

  if (orgsLoading || detailQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-mute">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t('editor.loading')}
      </div>
    )
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="space-y-3 p-8 text-center">
        <p role="alert" className="text-sm text-destructive">
          {(detailQuery.error as unknown as ApiError)?.message || t('editor.errors.loadFailed')}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void detailQuery.refetch()}
        >
          {t('retry')}
        </Button>
      </div>
    )
  }

  return (
    <FlowEditorProvider value={editorContextValue}>
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[520px] w-full min-w-0 flex-col gap-3">
      <FlowToolbar
        name={name}
        status={status}
        dirty={dirty}
        validationState={validationState}
        validationErrorCount={validationErrors.length}
        readOnly={readOnly}
        canSave={canEdit}
        canPublish={canPublish}
        saving={saveMutation.isPending}
        validating={validateMutation.isPending}
        publishing={publishMutation.isPending}
        settingsOpen={settingsOpen}
        onNameChange={(value) => {
          setName(value)
          markDirty()
        }}
        onSave={() => saveMutation.mutate()}
        onValidate={() => validateMutation.mutate()}
        onPublish={() => publishMutation.mutate()}
        onToggleSettings={() => {
          setSettingsOpen((open) => !open)
          if (!settingsOpen) setSelectedId(null)
        }}
      />

      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      {validationErrors.length > 0 ? (
        <ul className="max-h-28 space-y-1 overflow-y-auto rounded-xl border border-negative/30 bg-canvas px-3 py-2 text-xs text-destructive">
          {validationErrors.map((error, index) => (
            <li key={`${error.code ?? 'err'}-${index}`}>
              {error.nodeId ? (
                <button
                  type="button"
                  className="text-left underline-offset-2 hover:underline"
                  onClick={() => focusValidationNode(error.nodeId)}
                >
                  {error.nodeId}: {error.message || error.code || t('errors.publishInvalid')}
                </button>
              ) : (
                <>{error.message || error.code || t('errors.publishInvalid')}</>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)_minmax(280px,340px)]">
        <FlowSidebarPalette disabled={readOnly} onAdd={addNode} />
        <FlowCanvas
          nodes={nodes}
          edges={edges}
          viewport={viewport}
          canvasKey={hydratedKey ?? flowId}
          readOnly={readOnly}
          instanceRef={reactFlowRef}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgesReplace={(next) => {
            setEdges(next)
            markDirty()
          }}
          onViewportChange={(next) => {
            setViewport(next)
          }}
          onSelect={(id) => {
            setSelectedId(id)
            if (id) setSettingsOpen(false)
          }}
          onAddNode={(node) => {
            setNodes((current) => [...current, node])
            setSelectedId(node.id)
            setSettingsOpen(false)
            markDirty()
          }}
        />
        <div className="min-h-0 overflow-hidden">
          {settingsOpen ? (
            <div className="h-full overflow-y-auto rounded-xl border border-dash-border bg-canvas p-4">
              <FlowSettingsPanel
                description={description}
                triggerType={triggerType}
                keywords={keywords}
                matchType={matchType}
                settings={settings}
                readOnly={readOnly}
                onDescriptionChange={(value) => {
                  setDescription(value)
                  markDirty()
                }}
                onTriggerTypeChange={(value) => {
                  setTriggerType(value)
                  markDirty()
                }}
                onKeywordsChange={(value) => {
                  setKeywords(value)
                  markDirty()
                }}
                onMatchTypeChange={(value) => {
                  setMatchType(value)
                  markDirty()
                }}
                onSettingsChange={(patch) => {
                  setSettings((current) => ({ ...current, ...patch }))
                  markDirty()
                }}
              />
            </div>
          ) : (
            <FlowNodeInspector
              node={selectedNode}
              readOnly={readOnly}
              templates={(templatesQuery.data ?? []).map((item) => ({
                id: item.id,
                name: item.name,
              }))}
              publishedFlows={(publishedFlowsQuery.data ?? []).map((item) => ({
                id: item.id,
                name: item.name,
              }))}
              onPatchData={patchSelectedData}
              onRenameHandle={renameSelectedHandle}
              onRemoveHandles={removeSelectedHandles}
              onDelete={() => {
                if (!selectedNode) return
                deleteNodeById(selectedNode.id)
              }}
            />
          )}
        </div>
      </div>
    </div>
    </FlowEditorProvider>
  )
}
