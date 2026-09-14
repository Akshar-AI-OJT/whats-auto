export const PLATFORM_SETTINGS_SINGLETON_KEY = 'default' as const

export const MFA_ENFORCEMENT_VALUES = [
  'none',
  'super_admin',
  'super_admin_and_platform_admin',
  'all',
] as const

export type MfaEnforcement = (typeof MFA_ENFORCEMENT_VALUES)[number]

export type PlatformSettingsRow = {
  id: string
  singletonKey: string
  platformName: string
  primaryDomain: string
  supportEmail: string
  sessionTimeoutHours: number
  mfaEnforcement: string
  passwordMinLength: number
  smtpDailyLimit: number
  googleSignInEnabled: boolean
  microsoftSignInEnabled: boolean
  oauthRedirectUrl: string
  maintenanceEnabled: boolean
  allowlistedIps: unknown
  nextMaintenanceWindow: Date | string | null
  defaultTimezone: string
  dataRetentionDays: number
  apiRateLimitPerMinute: number
  billingBrandName: string
  billingLegalName: string
  billingTagline: string
  billingAddress: string
  billingGstin: string
  billingEmail: string
  billingPhone: string
  billingWebsite: string
  updatedByUserId: string | null
  createdAt: Date | string
  updatedAt: Date | string | null
}

export type PlatformSettingsPublic = {
  id: string
  platformName: string
  primaryDomain: string
  supportEmail: string
  sessionTimeoutHours: number
  mfaEnforcement: MfaEnforcement
  passwordMinLength: number
  smtpMailer: string
  smtpFromName: string
  smtpFromAddress: string
  smtpDailyLimit: number
  smtpHostConfigured: boolean
  smtpPasswordConfigured: boolean
  brevoApiKeyConfigured: boolean
  googleSignInEnabled: boolean
  googleSignInConfigured: boolean
  microsoftSignInEnabled: boolean
  microsoftSignInConfigured: boolean
  oauthRedirectUrl: string
  maintenanceEnabled: boolean
  allowlistedIps: string[]
  nextMaintenanceWindow: string | null
  defaultTimezone: string
  dataRetentionDays: number
  apiRateLimitPerMinute: number
  billingBrandName: string
  billingLegalName: string
  billingTagline: string
  billingAddress: string
  billingGstin: string
  billingEmail: string
  billingPhone: string
  billingWebsite: string
  updatedByUserId: string | null
  createdAt: string
  updatedAt: string | null
}

export type UpdatePlatformSettingsInput = {
  platformName?: string
  primaryDomain?: string
  supportEmail?: string
  sessionTimeoutHours?: number
  mfaEnforcement?: MfaEnforcement
  passwordMinLength?: number
  smtpDailyLimit?: number
  googleSignInEnabled?: boolean
  microsoftSignInEnabled?: boolean
  oauthRedirectUrl?: string
  maintenanceEnabled?: boolean
  allowlistedIps?: string[]
  nextMaintenanceWindow?: Date | string | null | { toJSDate: () => Date }
  defaultTimezone?: string
  dataRetentionDays?: number
  apiRateLimitPerMinute?: number
  billingBrandName?: string
  billingLegalName?: string
  billingTagline?: string
  billingAddress?: string
  billingGstin?: string
  billingEmail?: string
  billingPhone?: string
  billingWebsite?: string
}
