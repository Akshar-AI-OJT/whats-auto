export enum FlowTriggerType {
  KEYWORD = 'KEYWORD',
  INBOUND_ANY = 'INBOUND_ANY',
  CAMPAIGN_REPLY = 'CAMPAIGN_REPLY',
  SUBFLOW_ENTRY = 'SUBFLOW_ENTRY',
}

export const FLOW_TRIGGER_TYPES = Object.values(FlowTriggerType)
