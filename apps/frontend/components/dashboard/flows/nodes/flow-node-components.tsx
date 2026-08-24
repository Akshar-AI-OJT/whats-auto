import type { NodeProps } from '@xyflow/react'
import {
  nodeLabel,
  sourceHandlesForNode,
  type FlowCanvasNodeType,
  type FlowRfNode,
} from '../flow-canvas-graph'
import { FlowNodeFrame } from './FlowNodeFrame'

function FlowTypedNode({
  type,
  typeLabel,
  props,
}: {
  type: FlowCanvasNodeType
  typeLabel: string
  props: NodeProps<FlowRfNode>
}) {
  const data = props.data ?? {}
  const handles = sourceHandlesForNode(type, data)
  return (
    <FlowNodeFrame
      type={type}
      typeLabel={typeLabel}
      label={nodeLabel(data, typeLabel)}
      selected={Boolean(props.selected)}
      showTarget={type !== 'TRIGGER'}
      handles={handles}
    >
      {type === 'INTERACTIVE_BUTTON' || type === 'INTERACTIVE_LIST' || type === 'CONDITION' ? (
        <ul className="mt-1 space-y-0.5">
          {handles.map((handle) => (
            <li key={handle.id} className="truncate text-[11px] text-mute">
              {handle.label}
            </li>
          ))}
        </ul>
      ) : null}
    </FlowNodeFrame>
  )
}

export function TriggerNode(props: NodeProps<FlowRfNode>) {
  return <FlowTypedNode type="TRIGGER" typeLabel="Trigger" props={props} />
}

export function MessageNode(props: NodeProps<FlowRfNode>) {
  return <FlowTypedNode type="MESSAGE" typeLabel="Message" props={props} />
}

export function TemplateNode(props: NodeProps<FlowRfNode>) {
  return <FlowTypedNode type="TEMPLATE" typeLabel="Template" props={props} />
}

export function InteractiveButtonNode(props: NodeProps<FlowRfNode>) {
  return <FlowTypedNode type="INTERACTIVE_BUTTON" typeLabel="Buttons" props={props} />
}

export function InteractiveListNode(props: NodeProps<FlowRfNode>) {
  return <FlowTypedNode type="INTERACTIVE_LIST" typeLabel="List" props={props} />
}

export function ConditionNode(props: NodeProps<FlowRfNode>) {
  return <FlowTypedNode type="CONDITION" typeLabel="Condition" props={props} />
}

export function SubflowNode(props: NodeProps<FlowRfNode>) {
  return <FlowTypedNode type="SUBFLOW" typeLabel="Subflow" props={props} />
}

export function AiRagNode(props: NodeProps<FlowRfNode>) {
  return <FlowTypedNode type="AI_RAG" typeLabel="AI RAG" props={props} />
}

export function HumanHandoverNode(props: NodeProps<FlowRfNode>) {
  return <FlowTypedNode type="HUMAN_HANDOVER" typeLabel="Handover" props={props} />
}

export function ExitNode(props: NodeProps<FlowRfNode>) {
  return <FlowTypedNode type="EXIT" typeLabel="Exit" props={props} />
}

export const flowNodeTypes = {
  TRIGGER: TriggerNode,
  MESSAGE: MessageNode,
  TEMPLATE: TemplateNode,
  INTERACTIVE_BUTTON: InteractiveButtonNode,
  INTERACTIVE_LIST: InteractiveListNode,
  CONDITION: ConditionNode,
  SUBFLOW: SubflowNode,
  AI_RAG: AiRagNode,
  HUMAN_HANDOVER: HumanHandoverNode,
  EXIT: ExitNode,
}
