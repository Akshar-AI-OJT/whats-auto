import vine from '@vinejs/vine'
import { MFA_ENFORCEMENT_VALUES } from '#types/platform_settings'

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$|^localhost$/
const TIMEZONE_RE = /^(UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+)$/
const IP_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$|^(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}$|^::1$|^::$/
const HTTP_URL_RE = /^https?:\/\/[^\s]+$/i

export const updatePlatformSettingsValidator = vine.create(
  vine.object({
    platformName: vine.string().trim().minLength(1).maxLength(120).optional(),
    primaryDomain: vine.string().trim().minLength(1).maxLength(253).regex(HOSTNAME_RE).optional(),
    supportEmail: vine.string().trim().email().maxLength(255).optional(),
    sessionTimeoutHours: vine.number().withoutDecimals().min(1).max(168).optional(),
    mfaEnforcement: vine.enum(MFA_ENFORCEMENT_VALUES).optional(),
    passwordMinLength: vine.number().withoutDecimals().min(8).max(128).optional(),
    smtpDailyLimit: vine.number().withoutDecimals().min(0).max(10_000_000).optional(),
    googleSignInEnabled: vine.boolean().optional(),
    microsoftSignInEnabled: vine.boolean().optional(),
    oauthRedirectUrl: vine.string().trim().maxLength(500).regex(HTTP_URL_RE).optional(),
    maintenanceEnabled: vine.boolean().optional(),
    allowlistedIps: vine
      .array(vine.string().trim().regex(IP_RE).maxLength(64))
      .maxLength(50)
      .optional(),
    nextMaintenanceWindow: vine.date().nullable().optional(),
    defaultTimezone: vine.string().trim().minLength(1).maxLength(64).regex(TIMEZONE_RE).optional(),
    dataRetentionDays: vine.number().withoutDecimals().min(1).max(3650).optional(),
    apiRateLimitPerMinute: vine.number().withoutDecimals().min(1).max(1_000_000).optional(),
    billingBrandName: vine.string().trim().maxLength(120).optional(),
    billingLegalName: vine.string().trim().maxLength(200).optional(),
    billingTagline: vine.string().trim().maxLength(200).optional(),
    billingAddress: vine.string().trim().maxLength(1000).optional(),
    billingGstin: vine
      .string()
      .trim()
      .maxLength(32)
      .regex(/^$|^[0-9A-Za-z]{15}$/)
      .optional(),
    billingEmail: vine
      .string()
      .trim()
      .maxLength(255)
      .regex(/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/)
      .optional(),
    billingPhone: vine.string().trim().maxLength(40).optional(),
    billingWebsite: vine.string().trim().maxLength(253).optional(),
  })
)
