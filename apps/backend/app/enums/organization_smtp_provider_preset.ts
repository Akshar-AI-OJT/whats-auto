export enum OrganizationSmtpProviderPreset {
  GMAIL = 'gmail',
  SENDGRID = 'sendgrid',
  RESEND = 'resend',
  SES = 'ses',
  BREVO = 'brevo',
  CUSTOM = 'custom',
}

export const ORGANIZATION_SMTP_PROVIDER_PRESETS = Object.values(OrganizationSmtpProviderPreset)

export type OrganizationSmtpProviderPresetValue =
  (typeof OrganizationSmtpProviderPreset)[keyof typeof OrganizationSmtpProviderPreset]

/** Presets that only support SMTP transport (not API). */
export const SMTP_ONLY_PROVIDER_PRESETS: ReadonlySet<OrganizationSmtpProviderPresetValue> = new Set(
  [
    OrganizationSmtpProviderPreset.GMAIL,
    OrganizationSmtpProviderPreset.SES,
    OrganizationSmtpProviderPreset.CUSTOM,
  ]
)
