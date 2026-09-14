import type { PlanBillingPeriod, PlanStatus, SubscriptionPlan } from './types'

const BYTES_PER_GIB = 1024 ** 3

/** Convert stored bytes to a GB string for admin plan forms. */
export function storageBytesToFormGb(bytes: number | null | undefined): string {
  if (bytes == null) return ''
  const gb = bytes / BYTES_PER_GIB
  return String(parseFloat(gb.toFixed(4)))
}

/** Parse GB from admin plan forms back to bytes for API persistence. */
export function formGbToStorageBytes(gb: string): number | null {
  const trimmed = gb.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * BYTES_PER_GIB)
}

/** Optional label overrides for plan limit keys shown in admin UI. */
const PLAN_LIMIT_LABEL_OVERRIDES: Record<string, string> = {
  storageBytes: 'Storage (GB)',
  messagesPerMonth: 'Messages / month',
  campaignsPerMonth: 'Campaigns / month',
  aiRepliesPerMonth: 'AI replies / month',
  whatsappNumbers: 'WhatsApp numbers',
  maxFileUploadMb: 'Max file upload (MB)',
  maxKnowledgeDocSizeMb: 'Max knowledge doc size (MB)',
  maxBroadcastRecipients: 'Max recipients per campaign',
  aiGenerationsPerConversationHour: 'AI generations / conversation / hour',
  dispatchRatePerSec: 'Campaign dispatch rate (per sec)',
  conversationInboxRetentionDays: 'Inbox retention (days)',
  auditLogRetentionDays: 'Audit log retention (days)',
  analyticsRetentionDays: 'Analytics retention (days)',
}

function formatLabelWord(word: string): string {
  const lower = word.toLowerCase()
  if (lower === 'whatsapp') return 'WhatsApp'
  if (lower === 'ai') return 'AI'
  if (lower === 'api') return 'API'
  if (lower === 'csv') return 'CSV'
  if (lower === 'mb') return 'MB'
  if (lower === 'gb') return 'GB'
  if (lower === 'sec') return 'sec'
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/** Turn camelCase keys into readable labels, e.g. maxActiveFlows → Max Active Flows. */
export function formatCamelCaseLabel(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  return spaced
    .split(' ')
    .filter(Boolean)
    .map(formatLabelWord)
    .join(' ')
}

/** Human-readable label for a plan limit field in admin forms. */
export function formatPlanLimitLabel(key: string): string {
  return PLAN_LIMIT_LABEL_OVERRIDES[key] ?? formatCamelCaseLabel(key)
}

export function formatPlanPrice(
  plan: Pick<SubscriptionPlan, 'price' | 'currency' | 'billingPeriod'>,
  customLabel: string,
  perMonth: string,
  perYear: string
) {
  if (plan.price == null || plan.billingPeriod === 'custom') return customLabel
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: plan.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(plan.price)
  if (plan.billingPeriod === 'yearly') return `${amount}${perYear}`
  return `${amount}${perMonth}`
}

export function formatLimit(value: number | null | undefined, unlimited: string) {
  if (value == null) return unlimited
  return value.toLocaleString('en-US')
}

export function formatPlanDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function enabledFeatureCount(plan: Pick<SubscriptionPlan, 'features'>) {
  return plan.features.filter((feature) => feature.enabled).length
}

export function planStatusTone(status: PlanStatus) {
  switch (status) {
    case 'active':
      return 'bg-primary-pale text-positive-deep ring-primary/25'
    case 'draft':
      return 'bg-[#FFF4E5] text-[#B45309] ring-[#FDBA74]/50'
    case 'archived':
      return 'bg-mute/15 text-mute ring-dash-border'
    default:
      return 'bg-mute/15 text-mute ring-dash-border'
  }
}

export function billingPeriodLabel(
  period: PlanBillingPeriod,
  labels: Record<PlanBillingPeriod, string>
) {
  return labels[period]
}
