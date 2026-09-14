import type {
  MetaTemplateLibraryItem,
  PlatformTemplateCatalogItem,
  WhatsappMessageTemplate,
} from '@/lib/api'
import { normalizeButtons, normalizeSampleValues } from '@/components/dashboard/templates/template-utils'

export const META_TEMPLATE_LIBRARY_INDUSTRIES = [
  'E_COMMERCE',
  'FINANCIAL_SERVICES',
  'TELECOMMUNICATION',
] as const

export const META_TEMPLATE_LIBRARY_TOPICS = [
  'ACCOUNT_OR_PRODUCT_PROTECTION',
  'ACCOUNT_UPDATES',
  'AI_AGENTS',
  'CALL_PERMISSIONS',
  'CONTACT_REQUEST',
  'CUSTOMER_FEEDBACK',
  'CUSTOMER_RE_ENGAGEMENT',
  'EVENT_REMINDER',
  'FIXED_TEMPLATE_PRICE_TEST',
  'GROUP_INVITE_LINK',
  'IDENTITY_VERIFICATION',
  'LEGAL_REGULATORY_COMPLIANCE',
  'ORDER_MANAGEMENT',
  'PAYMENTS',
  'PUBLIC_ANNOUNCEMENTS',
  'PUBLIC_DISRUPTION',
  'PUBLIC_SAFETY',
  'PUBLIC_SERVICE',
  'REGULATORY_COMPLIANCE',
] as const

export function formatMetaEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function catalogItemToPreviewProps(item: PlatformTemplateCatalogItem) {
  return {
    name: item.name,
    headerType: item.headerType,
    headerContent: item.headerContent,
    bodyText: item.bodyText,
    footerText: item.footerText,
    buttons: normalizeButtons(item.buttons),
    sampleValues: normalizeSampleValues(item.sampleValues),
  }
}

export function libraryItemToPreviewProps(item: MetaTemplateLibraryItem) {
  const header = item.header?.trim()
  return {
    name: item.name,
    headerType: header ? 'TEXT' : 'NONE',
    headerContent: header ?? null,
    bodyText: item.body ?? '',
    footerText: item.footer ?? null,
    buttons: normalizeButtons(item.buttons),
  }
}

export function libraryItemMatchesFilters(
  item: MetaTemplateLibraryItem,
  filters: { category?: string; language?: string }
) {
  if (
    filters.category &&
    (item.category ?? '').toUpperCase() !== filters.category.toUpperCase()
  ) {
    return false
  }
  if (filters.language && (item.language ?? '') !== filters.language) {
    return false
  }
  return true
}

export function libraryItemKey(item: MetaTemplateLibraryItem) {
  return `${item.name ?? ''}:${item.language ?? 'en_US'}`
}

export function catalogTemplateAsWhatsapp(
  item: PlatformTemplateCatalogItem
): WhatsappMessageTemplate {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    language: item.language,
    bodyText: item.bodyText,
    status: 'approved',
    headerType: item.headerType,
    headerContent: item.headerContent,
    footerText: item.footerText,
    buttons: item.buttons,
    sampleValues: item.sampleValues,
  } as WhatsappMessageTemplate
}
