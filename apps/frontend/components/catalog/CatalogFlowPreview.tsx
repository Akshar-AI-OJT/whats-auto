'use client'

import { useMemo } from 'react'
import type { OnEdgesChange, OnNodesChange } from '@xyflow/react'
import { FlowCanvas } from '@/components/dashboard/flows/FlowCanvas'
import { FlowEditorProvider } from '@/components/dashboard/flows/flow-editor-context'
import {
  DEFAULT_VIEWPORT,
  graphToRf,
  type FlowRfEdge,
  type FlowRfNode,
} from '@/components/dashboard/flows/flow-canvas-graph'
import type {
  ConversationFlowGraphEdge,
  ConversationFlowGraphNode,
  ConversationFlowTriggerType,
  ConversationFlowViewport,
  WhatsappMessageTemplate,
} from '@/lib/api'
import { cn } from '@/lib/utils'

export function CatalogFlowPreview({
  canvasKey,
  triggerType,
  triggerKeywords,
  nodes,
  edges,
  viewport,
  templatesById,
  publishedFlowsById,
  className,
}: {
  canvasKey: string
  triggerType: ConversationFlowTriggerType
  triggerKeywords: string[]
  nodes?: ConversationFlowGraphNode[]
  edges?: ConversationFlowGraphEdge[]
  viewport?: ConversationFlowViewport | null
  templatesById?: Map<string, WhatsappMessageTemplate>
  publishedFlowsById?: Map<string, { id: string; name: string }>
  className?: string
}) {
  const graph = useMemo(() => graphToRf({ nodes, edges }), [edges, nodes])
  const editorValue = useMemo(
    () => ({
      triggerType,
      triggerKeywords,
      templatesById: templatesById ?? new Map(),
      publishedFlowsById: publishedFlowsById ?? new Map(),
      readOnly: true,
      patchNodeData: () => undefined,
      renameHandle: () => undefined,
      removeHandles: () => undefined,
      deleteNode: () => undefined,
      patchTriggerKeywords: () => undefined,
    }),
    [publishedFlowsById, templatesById, triggerKeywords, triggerType]
  )

  const onNodesChange: OnNodesChange<FlowRfNode> = () => undefined
  const onEdgesChange: OnEdgesChange<FlowRfEdge> = () => undefined

  return (
    <FlowEditorProvider value={editorValue}>
      <div className={cn('h-full min-h-90', className)}>
        <FlowCanvas
          nodes={graph.nodes}
          edges={graph.edges}
          viewport={viewport ?? DEFAULT_VIEWPORT}
          canvasKey={canvasKey}
          readOnly
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgesReplace={() => undefined}
          onViewportChange={() => undefined}
          onSelect={() => undefined}
          onAddNode={() => undefined}
        />
      </div>
    </FlowEditorProvider>
  )
}
