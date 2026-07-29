/** Shared options + types for the organization onboarding wizard. */

export const ORG_WIZARD_STEPS = [1, 2, 3] as const
export type OrgWizardStep = (typeof ORG_WIZARD_STEPS)[number]

export const INDUSTRY_OPTIONS = [
  'retail',
  'ecommerce',
  'healthcare',
  'education',
  'saas',
  'finance',
  'hospitality',
  'realEstate',
  'agency',
  'other',
] as const
export type IndustryOption = (typeof INDUSTRY_OPTIONS)[number]

export const COMPANY_SIZE_OPTIONS = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '500plus',
] as const
export type CompanySizeOption = (typeof COMPANY_SIZE_OPTIONS)[number]

export const COUNTRY_OPTIONS = [
  { code: 'IN', labelKey: 'IN' },
  { code: 'US', labelKey: 'US' },
  { code: 'GB', labelKey: 'GB' },
  { code: 'AE', labelKey: 'AE' },
  { code: 'SG', labelKey: 'SG' },
  { code: 'AU', labelKey: 'AU' },
  { code: 'CA', labelKey: 'CA' },
  { code: 'DE', labelKey: 'DE' },
  { code: 'FR', labelKey: 'FR' },
  { code: 'NL', labelKey: 'NL' },
] as const

export const LANGUAGE_OPTIONS = ['en', 'hi'] as const
export type LanguageOption = (typeof LANGUAGE_OPTIONS)[number]

export const DATE_FORMAT_OPTIONS = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
] as const
export type DateFormatOption = (typeof DATE_FORMAT_OPTIONS)[number]

export const TIME_FORMAT_OPTIONS = ['12h', '24h'] as const
export type TimeFormatOption = (typeof TIME_FORMAT_OPTIONS)[number]

export const THEME_PREFERENCE_OPTIONS = ['system', 'light', 'dark'] as const
export type ThemePreferenceOption = (typeof THEME_PREFERENCE_OPTIONS)[number]

export const NOTIFICATION_OPTIONS = [
  'emailUpdates',
  'productTips',
  'campaignAlerts',
] as const
export type NotificationOption = (typeof NOTIFICATION_OPTIONS)[number]

export type OrganizationWizardState = {
  // Step 1 — basics
  name: string
  slug: string
  email: string
  phone: string
  slugTouched: boolean
  // Step 2 — company
  logoFileName: string
  logoPreviewUrl: string | null
  industry: IndustryOption | ''
  companySize: CompanySizeOption | ''
  country: string
  timezone: string
  // Step 3 — preferences
  defaultLanguage: LanguageOption
  dateFormat: DateFormatOption
  timeFormat: TimeFormatOption
  themePreference: ThemePreferenceOption
  notifications: NotificationOption[]
}

export type OrganizationWizardBasicsErrors = {
  name?: string
  slug?: string
  email?: string
  phone?: string
}

export type OrganizationWizardCompanyErrors = {
  industry?: string
  companySize?: string
  country?: string
  timezone?: string
}

export type OrganizationWizardPreferencesErrors = {
  defaultLanguage?: string
  dateFormat?: string
  timeFormat?: string
  themePreference?: string
}
