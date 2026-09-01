import type { PlanFeatureDefinition } from './types'

/**
 * Enforceable v1 plan feature catalog for admin plan forms/views.
 * Mirrors backend PLAN_FEATURE_KEYS. Deferred keys are intentionally omitted.
 * Plan rows themselves come from the live superadmin API.
 */
export const PLAN_FEATURE_CATALOG: PlanFeatureDefinition[] = [
  { key: 'wabaConnection', label: 'Connect Meta & WABA', category: 'integrations' },
  { key: 'contactCsvImportExport', label: 'CSV contact import & export', category: 'messaging' },
  { key: 'customTemplates', label: 'Custom WhatsApp templates', category: 'messaging' },
  { key: 'scheduledCampaigns', label: 'Scheduled broadcast campaigns', category: 'automation' },
  { key: 'flowBuilder', label: 'Flow Builder', category: 'automation' },
  { key: 'flowAdvancedNodes', label: 'Advanced flow nodes', category: 'automation' },
  { key: 'aiAutonomous', label: 'AI autonomous auto-reply', category: 'ai' },
  {
    key: 'eCommerceIntegrations',
    label: 'E-commerce store integrations',
    category: 'integrations',
  },
  { key: 'apiAccess', label: 'API access', category: 'integrations' },
  { key: 'customRoles', label: 'Custom roles & permissions', category: 'team' },
]

const catalogLabelByKey = new Map(PLAN_FEATURE_CATALOG.map((item) => [item.key, item.label]))

export function getPlanFeatureCatalogLabel(featureKey: string): string | undefined {
  return catalogLabelByKey.get(featureKey)
}
