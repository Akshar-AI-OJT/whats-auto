import type { PlanFeatureDefinition } from './types'

/**
 * Enforceable v1 plan feature catalog for admin plan forms/views.
 * Mirrors backend PLAN_FEATURE_KEYS. Deferred keys are intentionally omitted.
 * Plan rows themselves come from the live superadmin API.
 */
export const PLAN_FEATURE_CATALOG: PlanFeatureDefinition[] = [
  { key: 'wabaConnection', category: 'integrations' },
  { key: 'contactCsvImportExport', category: 'messaging' },
  { key: 'customTemplates', category: 'messaging' },
  { key: 'scheduledCampaigns', category: 'automation' },
  { key: 'flowBuilder', category: 'automation' },
  { key: 'flowAdvancedNodes', category: 'automation' },
  { key: 'aiAutonomous', category: 'ai' },
  { key: 'eCommerceIntegrations', category: 'integrations' },
  { key: 'apiAccess', category: 'integrations' },
  { key: 'customRoles', category: 'team' },
]
