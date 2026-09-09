import env from '#start/env'

export type PlatformSettingState = 'enabled' | 'disabled' | 'scheduled'

export type PlatformSettingItem = {
  id: string
  key: string
  value: string
  state: PlatformSettingState
}

export type PlatformSettingsSnapshot = {
  branding: PlatformSettingItem[]
  authentication: PlatformSettingItem[]
  smtp: PlatformSettingItem[]
  oauth: PlatformSettingItem[]
  maintenanceMode: PlatformSettingItem[]
  configuration: PlatformSettingItem[]
}

function item(
  section: string,
  key: string,
  value: string,
  state: PlatformSettingState
): PlatformSettingItem {
  return {
    id: `${section}_${key}`,
    key,
    value,
    state,
  }
}

function hostnameFromUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed).hostname || null
  } catch {
    return null
  }
}

/**
 * Read-only platform settings derived from process env / auth wiring.
 * Does not invent product features (MFA, maintenance windows, etc.).
 * Secrets are never returned.
 */
export class PlatformSettingsService {
  getSnapshot(): PlatformSettingsSnapshot {
    const corsOrigin = String(env.get('CORS_ORIGIN') ?? '').trim()
    const appUrl = String(env.get('APP_URL') ?? '').trim()
    const betterAuthUrl = String(env.get('BETTER_AUTH_URL') ?? '')
      .trim()
      .replace(/\/$/, '')
    const primaryDomain =
      hostnameFromUrl(corsOrigin) ?? hostnameFromUrl(appUrl) ?? hostnameFromUrl(betterAuthUrl)

    const branding: PlatformSettingItem[] = []
    if (primaryDomain) {
      branding.push(item('branding', 'primaryDomain', primaryDomain, 'enabled'))
    }

    const accessTtl = String(env.get('JWT_ACCESS_TOKEN_TTL') ?? '').trim()
    const authentication: PlatformSettingItem[] = []
    if (accessTtl) {
      authentication.push(item('authentication', 'sessionTimeout', accessTtl, 'enabled'))
    }

    const mailer = String(env.get('MAIL_MAILER') ?? '').trim()
    const fromName = String(env.get('MAIL_FROM_NAME') ?? '').trim()
    const fromAddress = String(env.get('MAIL_FROM_ADDRESS') ?? '').trim()
    const smtpHost = String(env.get('SMTP_HOST') ?? '').trim()
    const smtp: PlatformSettingItem[] = []
    if (mailer) {
      const providerValue = smtpHost ? `${mailer} (${smtpHost})` : mailer
      smtp.push(
        item('smtp', 'provider', providerValue, smtpHost || mailer ? 'enabled' : 'disabled')
      )
    }
    if (fromAddress) {
      const display = fromName ? `${fromName} <${fromAddress}>` : fromAddress
      smtp.push(item('smtp', 'fromAddress', display, 'enabled'))
    }

    const googleClientId = String(env.get('GOOGLE_CLIENT_ID') ?? '').trim()
    // Presence only — never release or serialize the secret.
    const googleConfigured = Boolean(googleClientId && env.get('GOOGLE_CLIENT_SECRET'))
    const oauth: PlatformSettingItem[] = [
      item(
        'oauth',
        'googleSignIn',
        googleConfigured ? 'Client configured' : 'Not configured',
        googleConfigured ? 'enabled' : 'disabled'
      ),
    ]
    if (betterAuthUrl) {
      oauth.push(
        item(
          'oauth',
          'redirectUrl',
          `${betterAuthUrl}/api/auth/callback/google`,
          googleConfigured ? 'enabled' : 'disabled'
        )
      )
    }

    return {
      branding,
      authentication,
      smtp,
      oauth,
      maintenanceMode: [],
      configuration: [],
    }
  }
}
