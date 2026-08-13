import type { PlanFeature, PlanFeatureDefinition, SubscriptionPlan } from './types'

/**
 * Centralized mock plan catalog.
 * Replace with API responses via `plan-service.ts` — do not scatter plan objects in UI.
 */

export const PLAN_FEATURE_CATALOG: PlanFeatureDefinition[] = [
  { key: 'whatsappMessaging', category: 'messaging' },
  { key: 'bulkMessaging', category: 'messaging' },
  { key: 'scheduledMessages', category: 'messaging' },
  { key: 'messageTemplates', category: 'messaging' },
  { key: 'automationWorkflows', category: 'automation' },
  { key: 'campaigns', category: 'automation' },
  { key: 'flowBuilder', category: 'automation' },
  { key: 'formBuilder', category: 'automation' },
  { key: 'aiAssistant', category: 'ai' },
  { key: 'aiAutomation', category: 'ai' },
  { key: 'aiVoiceCalling', category: 'ai' },
  { key: 'multipleUsers', category: 'team' },
  { key: 'multipleWorkspaces', category: 'team' },
  { key: 'rolesPermissions', category: 'team' },
  { key: 'whatsappAccounts', category: 'integrations' },
  { key: 'thirdPartyIntegrations', category: 'integrations' },
  { key: 'apiAccess', category: 'integrations' },
]

function feature(
  key: PlanFeatureDefinition['key'],
  enabled: boolean,
  description?: string
): PlanFeature {
  const def = PLAN_FEATURE_CATALOG.find((item) => item.key === key)
  return {
    key,
    name: key,
    enabled,
    description,
    category: def?.category ?? 'messaging',
  }
}

function allFeatures(enabledKeys: string[]): PlanFeature[] {
  return PLAN_FEATURE_CATALOG.map((item) =>
    feature(item.key, enabledKeys.includes(item.key))
  )
}

export const MOCK_PLANS_SEED: SubscriptionPlan[] = [
  {
    id: 'plan_starter',
    name: 'Starter',
    description: 'For small teams getting started with WhatsApp automation.',
    price: 29,
    currency: 'USD',
    billingPeriod: 'monthly',
    status: 'active',
    popular: false,
    trialDays: 14,
    limits: { users: 10, messagesPerMonth: 25_000, workspaces: 3 },
    features: allFeatures([
      'whatsappMessaging',
      'messageTemplates',
      'scheduledMessages',
      'multipleUsers',
      'whatsappAccounts',
    ]),
    createdAt: '2026-01-12T08:00:00.000Z',
    updatedAt: '2026-07-02T10:00:00.000Z',
  },
  {
    id: 'plan_growth',
    name: 'Growth',
    description: 'For growing workspaces that need campaigns and automation.',
    price: 99,
    currency: 'USD',
    billingPeriod: 'monthly',
    status: 'active',
    popular: true,
    trialDays: 14,
    limits: { users: 40, messagesPerMonth: 100_000, workspaces: 10 },
    features: allFeatures([
      'whatsappMessaging',
      'bulkMessaging',
      'scheduledMessages',
      'messageTemplates',
      'automationWorkflows',
      'campaigns',
      'aiAssistant',
      'multipleUsers',
      'multipleWorkspaces',
      'rolesPermissions',
      'whatsappAccounts',
    ]),
    createdAt: '2026-01-12T08:00:00.000Z',
    updatedAt: '2026-08-01T09:30:00.000Z',
  },
  {
    id: 'plan_scale',
    name: 'Scale',
    description: 'For multi-workspace teams with higher volume and controls.',
    price: 249,
    currency: 'USD',
    billingPeriod: 'monthly',
    status: 'active',
    popular: false,
    trialDays: 7,
    limits: { users: 100, messagesPerMonth: 500_000, workspaces: 25 },
    features: allFeatures([
      'whatsappMessaging',
      'bulkMessaging',
      'scheduledMessages',
      'messageTemplates',
      'automationWorkflows',
      'campaigns',
      'flowBuilder',
      'formBuilder',
      'aiAssistant',
      'aiAutomation',
      'multipleUsers',
      'multipleWorkspaces',
      'rolesPermissions',
      'whatsappAccounts',
      'thirdPartyIntegrations',
      'apiAccess',
    ]),
    createdAt: '2026-02-04T08:00:00.000Z',
    updatedAt: '2026-08-05T12:00:00.000Z',
  },
  {
    id: 'plan_enterprise',
    name: 'Enterprise',
    description: 'Custom limits, SSO, and dedicated support for large orgs.',
    price: null,
    currency: 'USD',
    billingPeriod: 'custom',
    status: 'active',
    popular: false,
    trialDays: null,
    limits: { users: null, messagesPerMonth: null, workspaces: null },
    features: allFeatures(PLAN_FEATURE_CATALOG.map((item) => item.key)),
    createdAt: '2026-03-18T08:00:00.000Z',
    updatedAt: '2026-06-20T11:00:00.000Z',
  },
  {
    id: 'plan_lite_draft',
    name: 'Lite',
    description: 'A lighter option for early-stage teams. Not published yet.',
    price: 19,
    currency: 'USD',
    billingPeriod: 'monthly',
    status: 'draft',
    popular: false,
    trialDays: 7,
    limits: { users: 5, messagesPerMonth: 8_000, workspaces: 1 },
    features: allFeatures(['whatsappMessaging', 'messageTemplates', 'multipleUsers']),
    createdAt: '2026-08-08T09:00:00.000Z',
    updatedAt: '2026-08-10T14:00:00.000Z',
  },
]
