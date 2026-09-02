'use client'

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  type Connection,
  type OnEdgesChange,
  type OnNodesChange,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useRef } from 'react'
import {
  FLOW_DND_TYPE,
  createFlowNode,
  isFlowCanvasNodeType,
  type FlowCanvasNodeType,
  type FlowRfEdge,
  type FlowRfNode,
} from './flow-canvas-graph'
import { flowNodeTypes } from './nodes/flow-node-components'

export function FlowCanvas({
  nodes,
  edges,
  viewport,
  canvasKey,
  readOnly,
  instanceRef,
  onNodesChange,
  onEdgesChange,
  onEdgesReplace,
  onViewportChange,
  onSelect,
  onAddNode,
}: {
  nodes: FlowRfNode[]
  edges: FlowRfEdge[]
  viewport: Viewport
  canvasKey: string
  readOnly: boolean
  instanceRef?: React.MutableRefObject<ReactFlowInstance<FlowRfNode, FlowRfEdge> | null>
  onNodesChange: OnNodesChange<FlowRfNode>
  onEdgesChange: OnEdgesChange<FlowRfEdge>
  onEdgesReplace: (edges: FlowRfEdge[]) => void
  onViewportChange: (viewport: Viewport) => void
  onSelect: (nodeId: string | null) => void
  onAddNode: (node: FlowRfNode) => void
}) {
  const localInstanceRef = useRef<ReactFlowInstance<FlowRfNode, FlowRfEdge> | null>(null)
  const rfRef = instanceRef ?? localInstanceRef

  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly) return
      onEdgesReplace(addEdge({ ...connection, id: `e_${crypto.randomUUID().slice(0, 8)}` }, edges))
    },
    [edges, onEdgesReplace, readOnly]
  )

  const addAt = useCallback(
    (type: FlowCanvasNodeType, position: { x: number; y: number }) => {
      if (readOnly || type === 'TRIGGER') return
      onAddNode(createFlowNode(type, position))
    },
    [onAddNode, readOnly]
  )

  return (
    <div
      className="h-full min-h-[360px] overflow-hidden rounded-xl border border-dash-border bg-dash-surface"
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        if (readOnly) return
        const type = event.dataTransfer.getData(FLOW_DND_TYPE)
        if (!isFlowCanvasNodeType(type) || type === 'TRIGGER') return
        const instance = rfRef.current
        const position = instance
          ? instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
          : { x: event.clientX, y: event.clientY }
        addAt(type, position)
      }}
    >
      <ReactFlow
        key={canvasKey}
        nodes={nodes}
        edges={edges}
        nodeTypes={flowNodeTypes}
        defaultViewport={viewport}
        onInit={(instance) => {
          rfRef.current = instance
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onMoveEnd={(_event, next) => onViewportChange(next)}
        onNodeClick={(_event, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(null)}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
        onBeforeDelete={async () => {
          const el = document.activeElement
          if (!el) return true
          const tag = el.tagName
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false
          if ((el as HTMLElement).isContentEditable) return false
          return true
        }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="bg-canvas!" />
      </ReactFlow>
    </div>
  )
}
