import vine from '@vinejs/vine'
import { ORGANIZATION_SMTP_PROVIDER_PRESETS } from '#enums/organization_smtp_provider_preset'
import { ORGANIZATION_SMTP_TRANSPORTS } from '#enums/organization_smtp_transport'
import { normalizeMailSecret } from '#lib/mail/normalize_mail_secret'

const providerPreset = () => vine.enum(ORGANIZATION_SMTP_PROVIDER_PRESETS)
const transport = () => vine.enum(ORGANIZATION_SMTP_TRANSPORTS)
const mailSecret = () =>
  vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(2048)
    .transform((value) => normalizeMailSecret(value)!)
    .nullable()
    .optional()

export const upsertOrganizationSmtpValidator = vine.create(
  vine.object({
    transport: transport(),
    providerPreset: providerPreset(),
    senderName: vine.string().trim().minLength(1).maxLength(255),
    senderEmail: vine.string().trim().email().maxLength(255),
    host: vine.string().trim().maxLength(255).nullable().optional(),
    port: vine.number().min(1).max(65535).nullable().optional(),
    secure: vine.boolean().nullable().optional(),
    username: vine.string().trim().maxLength(255).nullable().optional(),
    password: mailSecret(),
    apiKey: mailSecret(),
  })
)

export const testOrganizationSmtpValidator = vine.create(
  vine.object({
    draftConfig: vine
      .object({
        transport: transport().optional(),
        providerPreset: providerPreset().optional(),
        senderName: vine.string().trim().minLength(1).maxLength(255).optional(),
        senderEmail: vine.string().trim().email().maxLength(255).optional(),
        host: vine.string().trim().maxLength(255).nullable().optional(),
        port: vine.number().min(1).max(65535).nullable().optional(),
        secure: vine.boolean().nullable().optional(),
        username: vine.string().trim().maxLength(255).nullable().optional(),
        password: mailSecret(),
        apiKey: mailSecret(),
      })
      .optional(),
  })
)
