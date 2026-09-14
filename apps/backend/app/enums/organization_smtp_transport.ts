export enum OrganizationSmtpTransport {
  SMTP = 'smtp',
  API = 'api',
}

export const ORGANIZATION_SMTP_TRANSPORTS = Object.values(OrganizationSmtpTransport)

export type OrganizationSmtpTransportValue =
  (typeof OrganizationSmtpTransport)[keyof typeof OrganizationSmtpTransport]
