import { getPlanFeatureCatalogLabel } from '@/components/admin/plans/plan-feature-catalog'

/** Tenant billing / onboarding feature labels. */
export const PLAN_FEATURE_I18N_NS = 'admin.subscriptions.features'

/** Superadmin plan form & view feature labels. */
export const ADMIN_PLAN_FEATURE_I18N_NS = 'admin.plans.features'

type FeatureTranslator = {
  has?: (key: string) => boolean
  (key: string): string
}

function looksLikeMissingTranslation(
  result: string,
  featureKey: string,
  namespace?: string
): boolean {
  if (!result || result === featureKey) return true
  if (namespace && result === `${namespace}.${featureKey}`) return true
  if (result.startsWith('admin.') && result.endsWith(featureKey)) return true
  return false
}

/**
 * Resolve a plan feature label without showing raw keys or missing i18n paths.
 * Order: i18n (when valid) → API name → catalog label → camelCase format.
 */
export function resolvePlanFeatureLabel(
  tFeatures: FeatureTranslator | undefined,
  featureKey: string,
  fallbackName?: string | null,
  namespace?: string
): string {
  if (featureKey && tFeatures) {
    const hasKey = tFeatures.has?.(featureKey) ?? true
    if (hasKey) {
      const translated = tFeatures(featureKey)
      if (!looksLikeMissingTranslation(translated, featureKey, namespace)) {
        return translated
      }
    }
  }

  const name = fallbackName?.trim()
  if (name && name !== featureKey && !looksLikeMissingTranslation(name, featureKey, namespace)) {
    return name
  }

  const catalogLabel = getPlanFeatureCatalogLabel(featureKey)
  if (catalogLabel) return catalogLabel

  return formatFeatureKeyFallback(featureKey)
}

function formatFeatureKeyFallback(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase()
      if (lower === 'whatsapp') return 'WhatsApp'
      if (lower === 'ai') return 'AI'
      if (lower === 'api') return 'API'
      if (lower === 'csv') return 'CSV'
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}
