import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

export default class OrganizationSmtpException extends Exception {
  static connectionFailed(reason: string) {
    return new OrganizationSmtpException(`SMTP connection failed: ${reason}`, {
      status: 422,
      code: 'E_SMTP_CONNECTION_FAILED',
    })
  }

  static invalidTransportForPreset(preset: string, transport: string) {
    return new OrganizationSmtpException(
      `Provider preset "${preset}" does not support ${transport} transport`,
      { status: 422, code: 'E_SMTP_INVALID_TRANSPORT' }
    )
  }

  static configNotFound() {
    return new OrganizationSmtpException(
      'No custom SMTP configuration found for this organization',
      { status: 404, code: 'E_SMTP_CONFIG_NOT_FOUND' }
    )
  }

  static passwordDecryptionFailed() {
    return new OrganizationSmtpException(
      'Failed to decrypt SMTP credentials. Re-save the configuration.',
      { status: 500, code: 'E_SMTP_DECRYPT_FAILED' }
    )
  }

  handle(error: this, { response }: HttpContext) {
    return response.status(error.status).send({
      error: error.message,
      code: error.code,
    })
  }
}
