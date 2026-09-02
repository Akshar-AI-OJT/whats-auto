'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { ConversationFlowTriggerType, WhatsappMessageTemplate } from '@/lib/api'

export type FlowEditorContextValue = {
  triggerType: ConversationFlowTriggerType
  triggerKeywords: string[]
  templatesById: Map<string, WhatsappMessageTemplate>
  publishedFlowsById: Map<string, { id: string; name: string }>
  readOnly: boolean
  patchNodeData: (nodeId: string, patch: Record<string, unknown>) => void
  renameHandle: (nodeId: string, oldId: string, nextId: string) => void
  removeHandles: (nodeId: string, handleIds: string[]) => void
  deleteNode: (nodeId: string) => void
  patchTriggerKeywords: (keywords: string[]) => void
}

const FlowEditorContext = createContext<FlowEditorContextValue | null>(null)

const EMPTY_EDITOR: FlowEditorContextValue = {
  triggerType: 'KEYWORD',
  triggerKeywords: [],
  templatesById: new Map(),
  publishedFlowsById: new Map(),
  readOnly: true,
  patchNodeData: () => undefined,
  renameHandle: () => undefined,
  removeHandles: () => undefined,
  deleteNode: () => undefined,
  patchTriggerKeywords: () => undefined,
}

export function FlowEditorProvider({
  value,
  children,
}: {
  value: FlowEditorContextValue
  children: ReactNode
}) {
  return <FlowEditorContext.Provider value={value}>{children}</FlowEditorContext.Provider>
}

export function useFlowEditor(): FlowEditorContextValue {
  return useContext(FlowEditorContext) ?? EMPTY_EDITOR
}
