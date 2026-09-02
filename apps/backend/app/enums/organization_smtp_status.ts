export enum OrganizationSmtpStatus {
  VERIFIED = 'verified',
  FAILED = 'failed',
}

export const ORGANIZATION_SMTP_STATUSES = Object.values(OrganizationSmtpStatus)

export type OrganizationSmtpStatusValue =
  (typeof OrganizationSmtpStatus)[keyof typeof OrganizationSmtpStatus]
