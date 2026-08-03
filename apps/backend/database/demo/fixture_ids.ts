import { createHash } from 'node:crypto'

/**
 * Deterministic UUIDv4-shaped IDs for demo fixtures.
 * Same key always yields the same UUID across reruns.
 */
export function stableUuid(key: string): string {
  const hash = createHash('sha256').update(`whats-auto-demo:${key}`).digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const FIXTURE_IDS = {
  plans: {
    starter: stableUuid('plan:starter'),
    growth: stableUuid('plan:growth'),
    scale: stableUuid('plan:scale'),
  },
  orgs: {
    northstar: stableUuid('org:northstar'),
    harbor: stableUuid('org:harbor'),
  },
  users: {
    superadmin: stableUuid('user:superadmin'),
    northstarOwner: stableUuid('user:northstar-owner'),
    northstarAdmin: stableUuid('user:northstar-admin'),
    northstarAgent: stableUuid('user:northstar-agent'),
    northstarViewer: stableUuid('user:northstar-viewer'),
    northstarSupport: stableUuid('user:northstar-support'),
    harborOwner: stableUuid('user:harbor-owner'),
    harborAdmin: stableUuid('user:harbor-admin'),
    harborAgent: stableUuid('user:harbor-agent'),
    harborViewer: stableUuid('user:harbor-viewer'),
  },
  accounts: {
    superadminCredential: stableUuid('account:superadmin-credential'),
    northstarOwnerCredential: stableUuid('account:northstar-owner-credential'),
    northstarOwnerGoogle: stableUuid('account:northstar-owner-google'),
    northstarAdminCredential: stableUuid('account:northstar-admin-credential'),
    northstarAgentCredential: stableUuid('account:northstar-agent-credential'),
    northstarViewerCredential: stableUuid('account:northstar-viewer-credential'),
    northstarSupportCredential: stableUuid('account:northstar-support-credential'),
    harborOwnerCredential: stableUuid('account:harbor-owner-credential'),
    harborAdminCredential: stableUuid('account:harbor-admin-credential'),
    harborAgentCredential: stableUuid('account:harbor-agent-credential'),
    harborViewerCredential: stableUuid('account:harbor-viewer-credential'),
  },
  customRoles: {
    northstarSupportLead: stableUuid('role:northstar-support-lead'),
  },
  members: {
    northstarOwner: stableUuid('member:northstar-owner'),
    northstarAdmin: stableUuid('member:northstar-admin'),
    northstarAgent: stableUuid('member:northstar-agent'),
    northstarViewer: stableUuid('member:northstar-viewer'),
    northstarSupport: stableUuid('member:northstar-support'),
    harborOwner: stableUuid('member:harbor-owner'),
    harborAdmin: stableUuid('member:harbor-admin'),
    harborAgent: stableUuid('member:harbor-agent'),
    harborViewer: stableUuid('member:harbor-viewer'),
  },
  userRoles: {
    superadmin: stableUuid('user-role:superadmin'),
    northstarOwner: stableUuid('user-role:northstar-owner'),
    northstarAdmin: stableUuid('user-role:northstar-admin'),
    northstarAgent: stableUuid('user-role:northstar-agent'),
    northstarViewer: stableUuid('user-role:northstar-viewer'),
    northstarSupport: stableUuid('user-role:northstar-support'),
    harborOwner: stableUuid('user-role:harbor-owner'),
    harborAdmin: stableUuid('user-role:harbor-admin'),
    harborAgent: stableUuid('user-role:harbor-agent'),
    harborViewer: stableUuid('user-role:harbor-viewer'),
  },
  invitations: {
    northstarPending: stableUuid('invitation:northstar-pending'),
  },
  verifications: {
    resetActive: stableUuid('verification:reset-active'),
    resetExpired: stableUuid('verification:reset-expired'),
  },
  overrides: {
    northstarAdminCampaignsLaunch: stableUuid('override:northstar-admin-campaigns-launch'),
    northstarAgentInboxAssign: stableUuid('override:northstar-agent-inbox-assign'),
  },
  audits: {
    northstarRoleOverride: stableUuid('audit:northstar-role-override'),
    northstarInviteCreated: stableUuid('audit:northstar-invite-created'),
  },
  whatsappConfigs: {
    northstarConnected: stableUuid('wa:northstar-connected'),
    northstarDisconnected: stableUuid('wa:northstar-disconnected'),
    harborError: stableUuid('wa:harbor-error'),
  },
  contacts: {
    northstarPriya: stableUuid('contact:northstar-priya'),
    northstarDeleted: stableUuid('contact:northstar-deleted'),
    harborJordan: stableUuid('contact:harbor-jordan'),
  },
  mediaAssets: {
    northstarProductShot: stableUuid('media:northstar-product'),
    harborClassFlyer: stableUuid('media:harbor-flyer'),
  },
  conversations: {
    northstarOpen: stableUuid('conversation:northstar-open'),
    northstarPending: stableUuid('conversation:northstar-pending'),
    northstarClosed: stableUuid('conversation:northstar-closed'),
    harborOpen: stableUuid('conversation:harbor-open'),
  },
  messages: {
    northstarInboundText: stableUuid('message:northstar-inbound-text'),
    northstarOutboundImage: stableUuid('message:northstar-outbound-image'),
    northstarTemplate: stableUuid('message:northstar-template'),
    northstarInteractive: stableUuid('message:northstar-interactive'),
    northstarQueued: stableUuid('message:northstar-queued'),
    northstarFailed: stableUuid('message:northstar-failed'),
    harborInbound: stableUuid('message:harbor-inbound'),
  },
  notes: {
    northstarAgentNote: stableUuid('note:northstar-agent'),
  },
  assignments: {
    northstarAssign: stableUuid('assignment:northstar-1'),
  },
  templates: {
    northstarDraftUtility: stableUuid('template:northstar-draft-utility'),
    northstarApprovedMarketing: stableUuid('template:northstar-approved-marketing'),
    northstarRejectedAuth: stableUuid('template:northstar-rejected-auth'),
    harborApprovedUtility: stableUuid('template:harbor-approved-utility'),
  },
  subscriptions: {
    northstar: stableUuid('subscription:northstar'),
    harbor: stableUuid('subscription:harbor'),
  },
  payments: {
    northstarSuccess: stableUuid('payment:northstar-success'),
    northstarFailed: stableUuid('payment:northstar-failed'),
    harborSuccess: stableUuid('payment:harbor-success'),
  },
  usageMeters: {
    northstarMessages: stableUuid('usage:northstar-messages'),
    harborMessages: stableUuid('usage:harbor-messages'),
  },
} as const
