export type FlowStackFrame = {
  flowId: string
  flowVersionId: string
  nodeId: string
  menuNodeId?: string
  /** Distinguishes menu frames from subflow return frames. */
  kind?: 'menu' | 'subflow'
  variablesSnapshot: Record<string, unknown>
  enteredAt: string
}

/** Hard cap against recursive subflow/menu runaway (static cycles cannot catch all paths). */
export const MAX_FLOW_STACK_DEPTH = 10

export type StackNavTarget = {
  callStack: FlowStackFrame[]
  targetNodeId: string
  targetFlowId: string
  targetVersionId: string
  variables: Record<string, unknown>
}

/**
 * Pure call-stack ops for BACK / MAIN_MENU / SUBFLOW.
 */
export function parseCallStack(raw: unknown): FlowStackFrame[] {
  if (!Array.isArray(raw)) return []

  const frames: FlowStackFrame[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const flowId = typeof record.flowId === 'string' ? record.flowId : null
    const flowVersionId = typeof record.flowVersionId === 'string' ? record.flowVersionId : null
    const nodeId = typeof record.nodeId === 'string' ? record.nodeId : null
    if (!flowId || !flowVersionId || !nodeId) continue

    const menuNodeId = typeof record.menuNodeId === 'string' ? record.menuNodeId : undefined
    const kind = record.kind === 'subflow' || record.kind === 'menu' ? record.kind : undefined
    const enteredAt = typeof record.enteredAt === 'string' ? record.enteredAt : ''
    const snapshot = record.variablesSnapshot
    const variablesSnapshot =
      snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
        ? { ...(snapshot as Record<string, unknown>) }
        : {}

    frames.push({
      flowId,
      flowVersionId,
      nodeId,
      ...(menuNodeId ? { menuNodeId } : {}),
      ...(kind ? { kind } : {}),
      variablesSnapshot,
      enteredAt,
    })
  }
  return frames
}

export function frameTargetNodeId(frame: FlowStackFrame): string {
  return frame.menuNodeId || frame.nodeId
}

export function canPushFrame(stack: FlowStackFrame[]): boolean {
  return stack.length < MAX_FLOW_STACK_DEPTH
}

/**
 * Push when entering a menu that is not already the top frame.
 * Returns null when max depth would be exceeded.
 */
export function ensureMenuFrame(
  stack: FlowStackFrame[],
  frame: Omit<FlowStackFrame, 'kind'> & { kind?: 'menu' }
): FlowStackFrame[] | null {
  const top = stack[stack.length - 1]
  if (
    top &&
    top.kind !== 'subflow' &&
    top.flowId === frame.flowId &&
    top.flowVersionId === frame.flowVersionId &&
    frameTargetNodeId(top) === frame.nodeId
  ) {
    return stack
  }
  if (!canPushFrame(stack)) return null
  return [...stack, { ...frame, kind: 'menu' }]
}

/**
 * Push a subflow return frame (parent caller). Returns null at max depth.
 */
export function pushSubflowFrame(
  stack: FlowStackFrame[],
  frame: Omit<FlowStackFrame, 'kind'>
): FlowStackFrame[] | null {
  if (!canPushFrame(stack)) return null
  return [...stack, { ...frame, kind: 'subflow' }]
}

/**
 * Pop the current frame. Root is never popped — BACK at root is a no-op.
 */
export function popBack(stack: FlowStackFrame[]): StackNavTarget | null {
  if (stack.length <= 1) return null
  const next = stack.slice(0, -1)
  const previous = next[next.length - 1]
  if (!previous) return null
  return {
    callStack: next,
    targetNodeId: frameTargetNodeId(previous),
    targetFlowId: previous.flowId,
    targetVersionId: previous.flowVersionId,
    variables: { ...previous.variablesSnapshot },
  }
}

/**
 * Unwind to a single root frame. Empty stack → null.
 */
export function unwindToRoot(stack: FlowStackFrame[]): StackNavTarget | null {
  const root = stack[0]
  if (!root) return null
  return {
    callStack: [root],
    targetNodeId: frameTargetNodeId(root),
    targetFlowId: root.flowId,
    targetVersionId: root.flowVersionId,
    variables: { ...root.variablesSnapshot },
  }
}
