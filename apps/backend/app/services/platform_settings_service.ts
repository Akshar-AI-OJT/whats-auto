import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { insertAuthorizationAudit } from '#lib/authorization_audit'
import PlatformSettingsException from '#exceptions/platform_settings_exception'
import {
  MFA_ENFORCEMENT_VALUES,
  PLATFORM_SETTINGS_SINGLETON_KEY,
  type MfaEnforcement,
  type PlatformSettingsPublic,
  type PlatformSettingsRow,
  type UpdatePlatformSettingsInput,
} from '#types/platform_settings'

function asIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function asStringArray(value: unknown): string[] {
  let parsed: unknown = value
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((item): item is string => typeof item === 'string')
}

function asMfa(value: string): MfaEnforcement {
  return (MFA_ENFORCEMENT_VALUES as readonly string[]).includes(value)
    ? (value as MfaEnforcement)
    : 'super_admin_and_platform_admin'
}

function isConfigured(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function toNullableDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toJSDate' in value &&
    typeof (value as { toJSDate: () => Date }).toJSDate === 'function'
  ) {
    const parsed = (value as { toJSDate: () => Date }).toJSDate()
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

export default class PlatformSettingsService {
  async get(): Promise<PlatformSettingsPublic> {
    const row = await this.#loadRow()
    return this.#toPublic(row)
  }

  async update(
    patch: UpdatePlatformSettingsInput,
    actorUserId?: string | null
  ): Promise<PlatformSettingsPublic> {
    const existing = await this.#loadRow()
    const updates: Record<string, unknown> = {}

    if (patch.platformName !== undefined) updates.platformName = patch.platformName
    if (patch.primaryDomain !== undefined) updates.primaryDomain = patch.primaryDomain
    if (patch.supportEmail !== undefined) updates.supportEmail = patch.supportEmail
    if (patch.sessionTimeoutHours !== undefined) {
      updates.sessionTimeoutHours = patch.sessionTimeoutHours
    }
    if (patch.mfaEnforcement !== undefined) updates.mfaEnforcement = patch.mfaEnforcement
    if (patch.passwordMinLength !== undefined) updates.passwordMinLength = patch.passwordMinLength
    if (patch.smtpDailyLimit !== undefined) updates.smtpDailyLimit = patch.smtpDailyLimit
    if (patch.googleSignInEnabled !== undefined) {
      updates.googleSignInEnabled = patch.googleSignInEnabled
    }
    if (patch.microsoftSignInEnabled !== undefined) {
      updates.microsoftSignInEnabled = patch.microsoftSignInEnabled
    }
    if (patch.oauthRedirectUrl !== undefined) updates.oauthRedirectUrl = patch.oauthRedirectUrl
    if (patch.maintenanceEnabled !== undefined) {
      updates.maintenanceEnabled = patch.maintenanceEnabled
    }
    if (patch.allowlistedIps !== undefined) {
      updates.allowlistedIps = JSON.stringify(patch.allowlistedIps)
    }
    if (patch.nextMaintenanceWindow !== undefined) {
      updates.nextMaintenanceWindow = toNullableDate(patch.nextMaintenanceWindow)
    }
    if (patch.defaultTimezone !== undefined) updates.defaultTimezone = patch.defaultTimezone
    if (patch.dataRetentionDays !== undefined) updates.dataRetentionDays = patch.dataRetentionDays
    if (patch.apiRateLimitPerMinute !== undefined) {
      updates.apiRateLimitPerMinute = patch.apiRateLimitPerMinute
    }
    if (patch.billingBrandName !== undefined) updates.billingBrandName = patch.billingBrandName
    if (patch.billingLegalName !== undefined) updates.billingLegalName = patch.billingLegalName
    if (patch.billingTagline !== undefined) updates.billingTagline = patch.billingTagline
    if (patch.billingAddress !== undefined) updates.billingAddress = patch.billingAddress
    if (patch.billingGstin !== undefined) {
      updates.billingGstin = patch.billingGstin.trim().toUpperCase()
    }
    if (patch.billingEmail !== undefined) updates.billingEmail = patch.billingEmail
    if (patch.billingPhone !== undefined) updates.billingPhone = patch.billingPhone
    if (patch.billingWebsite !== undefined) updates.billingWebsite = patch.billingWebsite

    if (Object.keys(updates).length > 0) {
      updates.updatedByUserId = actorUserId ?? null
      await db
        .from('platform_settings')
        .where('singletonKey', PLATFORM_SETTINGS_SINGLETON_KEY)
        .update(updates)
    }

    const snapshot = await this.get()
    if (Object.keys(updates).length > 0) {
      await insertAuthorizationAudit({
        organizationId: null,
        actorUserId: actorUserId ?? null,
        targetType: 'platform_settings',
        targetId: existing.id,
        eventType: 'platform_settings.updated',
        after: {
          platformName: snapshot.platformName,
          maintenanceEnabled: snapshot.maintenanceEnabled,
        },
      })
    }
    return snapshot
  }

  async #loadRow(): Promise<PlatformSettingsRow> {
    const row = await db
      .from('platform_settings')
      .where('singletonKey', PLATFORM_SETTINGS_SINGLETON_KEY)
      .first()

    if (!row) {
      throw PlatformSettingsException.notFound()
    }

    return row as PlatformSettingsRow
  }

  #toPublic(row: PlatformSettingsRow): PlatformSettingsPublic {
    return {
      id: row.id,
      platformName: row.platformName,
      primaryDomain: row.primaryDomain,
      supportEmail: row.supportEmail,
      sessionTimeoutHours: Number(row.sessionTimeoutHours),
      mfaEnforcement: asMfa(row.mfaEnforcement),
      passwordMinLength: Number(row.passwordMinLength),
      smtpMailer: env.get('MAIL_MAILER'),
      smtpFromName: env.get('MAIL_FROM_NAME'),
      smtpFromAddress: env.get('MAIL_FROM_ADDRESS'),
      smtpDailyLimit: Number(row.smtpDailyLimit),
      smtpHostConfigured: Boolean(env.get('SMTP_HOST')),
      smtpPasswordConfigured: isConfigured(env.get('SMTP_PASSWORD')),
      brevoApiKeyConfigured: isConfigured(env.get('BREVO_API')),
      googleSignInEnabled: Boolean(row.googleSignInEnabled),
      googleSignInConfigured: isConfigured(env.get('GOOGLE_CLIENT_ID')),
      microsoftSignInEnabled: Boolean(row.microsoftSignInEnabled),
      microsoftSignInConfigured: false,
      oauthRedirectUrl: row.oauthRedirectUrl,
      maintenanceEnabled: Boolean(row.maintenanceEnabled),
      allowlistedIps: asStringArray(row.allowlistedIps),
      nextMaintenanceWindow: asIso(row.nextMaintenanceWindow),
      defaultTimezone: row.defaultTimezone,
      dataRetentionDays: Number(row.dataRetentionDays),
      apiRateLimitPerMinute: Number(row.apiRateLimitPerMinute),
      billingBrandName: row.billingBrandName ?? '',
      billingLegalName: row.billingLegalName ?? '',
      billingTagline: row.billingTagline ?? '',
      billingAddress: row.billingAddress ?? '',
      billingGstin: row.billingGstin ?? '',
      billingEmail: row.billingEmail ?? '',
      billingPhone: row.billingPhone ?? '',
      billingWebsite: row.billingWebsite ?? '',
      updatedByUserId: row.updatedByUserId,
      createdAt: asIso(row.createdAt) ?? new Date().toISOString(),
      updatedAt: asIso(row.updatedAt),
    }
  }
}
