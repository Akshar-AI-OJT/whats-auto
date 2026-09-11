/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  auth: {
    signInEmail: typeof routes['auth.sign_in_email']
    signOut: typeof routes['auth.sign_out']
    getSession: typeof routes['auth.get_session']
    token: typeof routes['auth.token']
    jwks: typeof routes['auth.jwks']
  }
  mediaPublic: {
    serve: typeof routes['media_public.serve']
  }
  whatsappWebhook: {
    verify: typeof routes['whatsapp_webhook.verify']
    receive: typeof routes['whatsapp_webhook.receive']
  }
  billingRazorpayWebhook: {
    receive: typeof routes['billing_razorpay_webhook.receive']
  }
  demoBookings: {
    availability: typeof routes['demo_bookings.availability']
    store: typeof routes['demo_bookings.store']
  }
  externalEvents: {
    store: typeof routes['external_events.store']
  }
  shopenupIntegrations: {
    store: typeof routes['shopenup_integrations.store']
  }
  whatsappEmbeddedSignup: {
    session: typeof routes['whatsapp_embedded_signup.session']
    complete: typeof routes['whatsapp_embedded_signup.complete']
  }
  whatsappConfigs: {
    index: typeof routes['whatsapp_configs.index']
    destroy: typeof routes['whatsapp_configs.destroy']
    show: typeof routes['whatsapp_configs.show']
    test: typeof routes['whatsapp_configs.test']
  }
  messageTemplates: {
    index: typeof routes['message_templates.index']
    show: typeof routes['message_templates.show']
    store: typeof routes['message_templates.store']
    sync: typeof routes['message_templates.sync']
    destroy: typeof routes['message_templates.destroy']
  }
  preSignup: typeof routes['pre_signup'] & {
    resend: typeof routes['pre_signup.resend']
  }
  verifySignup: typeof routes['verify_signup']
  profile: {
    show: typeof routes['profile.show']
  }
  superAdminOrganizations: {
    index: typeof routes['super_admin_organizations.index']
    show: typeof routes['super_admin_organizations.show']
    update: typeof routes['super_admin_organizations.update']
    suspend: typeof routes['super_admin_organizations.suspend']
    activate: typeof routes['super_admin_organizations.activate']
    softDelete: typeof routes['super_admin_organizations.soft_delete']
  }
  superAdminSubscriptions: {
    index: typeof routes['super_admin_subscriptions.index']
    store: typeof routes['super_admin_subscriptions.store']
    show: typeof routes['super_admin_subscriptions.show']
    update: typeof routes['super_admin_subscriptions.update']
    softDelete: typeof routes['super_admin_subscriptions.soft_delete']
  }
  superAdminPlans: {
    index: typeof routes['super_admin_plans.index']
    store: typeof routes['super_admin_plans.store']
    show: typeof routes['super_admin_plans.show']
    update: typeof routes['super_admin_plans.update']
    softDelete: typeof routes['super_admin_plans.soft_delete']
  }
  superAdminInvoices: {
    summary: typeof routes['super_admin_invoices.summary']
    billingProfile: typeof routes['super_admin_invoices.billing_profile']
    index: typeof routes['super_admin_invoices.index']
    store: typeof routes['super_admin_invoices.store']
    show: typeof routes['super_admin_invoices.show']
    markPaid: typeof routes['super_admin_invoices.mark_paid']
    regenerate: typeof routes['super_admin_invoices.regenerate']
    send: typeof routes['super_admin_invoices.send']
    download: typeof routes['super_admin_invoices.download']
  }
  superAdminPlatformSettings: {
    show: typeof routes['super_admin_platform_settings.show']
    update: typeof routes['super_admin_platform_settings.update']
  }
  superAdminAiConfig: {
    show: typeof routes['super_admin_ai_config.show']
    update: typeof routes['super_admin_ai_config.update']
  }
  superAdminAudit: {
    index: typeof routes['super_admin_audit.index']
  }
  superAdminAnalytics: {
    summary: typeof routes['super_admin_analytics.summary']
  }
  superAdminPlatformUsers: {
    index: typeof routes['super_admin_platform_users.index']
  }
  superAdminSearch: {
    index: typeof routes['super_admin_search.index']
  }
  organizationAdminUsers: {
    index: typeof routes['organization_admin_users.index']
    show: typeof routes['organization_admin_users.show']
    update: typeof routes['organization_admin_users.update']
    softDelete: typeof routes['organization_admin_users.soft_delete']
  }
  organizations: {
    store: typeof routes['organizations.store']
    index: typeof routes['organizations.index']
    setActive: typeof routes['organizations.set_active']
    update: typeof routes['organizations.update']
    destroy: typeof routes['organizations.destroy']
  }
  invitations: {
    store: typeof routes['invitations.store']
  }
  organizationSmtp: {
    show: typeof routes['organization_smtp.show']
    update: typeof routes['organization_smtp.update']
    test: typeof routes['organization_smtp.test']
    destroy: typeof routes['organization_smtp.destroy']
  }
  accessContext: {
    show: typeof routes['access_context.show']
  }
  globalSearch: {
    index: typeof routes['global_search.index']
  }
  onboarding: {
    show: typeof routes['onboarding.show']
  }
  roles: {
    index: typeof routes['roles.index']
    create: typeof routes['roles.create']
    preview: typeof routes['roles.preview']
    update: typeof routes['roles.update']
    reset: typeof routes['roles.reset']
    destroy: typeof routes['roles.destroy']
  }
  members: {
    index: typeof routes['members.index']
    assignRole: typeof routes['members.assign_role']
    resendInvite: typeof routes['members.resend_invite']
    remove: typeof routes['members.remove']
  }
  ownership: {
    transfer: typeof routes['ownership.transfer']
  }
  audit: {
    index: typeof routes['audit.index']
  }
  analytics: {
    summary: typeof routes['analytics.summary']
  }
  contacts: {
    index: typeof routes['contacts.index']
    store: typeof routes['contacts.store']
    importCsv: typeof routes['contacts.import_csv']
    showImport: typeof routes['contacts.show_import']
    show: typeof routes['contacts.show']
    update: typeof routes['contacts.update']
    softDelete: typeof routes['contacts.soft_delete']
  }
  tags: {
    index: typeof routes['tags.index']
    store: typeof routes['tags.store']
    contacts: typeof routes['tags.contacts']
    assignContact: typeof routes['tags.assign_contact']
    removeContact: typeof routes['tags.remove_contact']
    show: typeof routes['tags.show']
    update: typeof routes['tags.update']
    destroy: typeof routes['tags.destroy']
  }
  apiKeys: {
    index: typeof routes['api_keys.index']
    store: typeof routes['api_keys.store']
    revoke: typeof routes['api_keys.revoke']
  }
  integrationConnections: {
    index: typeof routes['integration_connections.index']
    show: typeof routes['integration_connections.show']
    upsert: typeof routes['integration_connections.upsert']
    destroy: typeof routes['integration_connections.destroy']
  }
  mediaUploads: {
    putContent: typeof routes['media_uploads.put_content']
    store: typeof routes['media_uploads.store']
    complete: typeof routes['media_uploads.complete']
  }
  mediaAssets: {
    organizationLogo: typeof routes['media_assets.organization_logo']
    index: typeof routes['media_assets.index']
    quota: typeof routes['media_assets.quota']
    show: typeof routes['media_assets.show']
    destroy: typeof routes['media_assets.destroy']
    restore: typeof routes['media_assets.restore']
    purge: typeof routes['media_assets.purge']
  }
  knowledgeDocuments: {
    index: typeof routes['knowledge_documents.index']
    store: typeof routes['knowledge_documents.store']
    show: typeof routes['knowledge_documents.show']
    completeUpload: typeof routes['knowledge_documents.complete_upload']
    destroy: typeof routes['knowledge_documents.destroy']
    restore: typeof routes['knowledge_documents.restore']
    purge: typeof routes['knowledge_documents.purge']
  }
  flows: {
    index: typeof routes['flows.index']
    store: typeof routes['flows.store']
    show: typeof routes['flows.show']
    update: typeof routes['flows.update']
    validate: typeof routes['flows.validate']
    publish: typeof routes['flows.publish']
    destroy: typeof routes['flows.destroy']
  }
  campaigns: {
    index: typeof routes['campaigns.index']
    preview: typeof routes['campaigns.preview']
    send: typeof routes['campaigns.send']
    schedule: typeof routes['campaigns.schedule']
    cancel: typeof routes['campaigns.cancel']
    duplicate: typeof routes['campaigns.duplicate']
    show: typeof routes['campaigns.show']
    store: typeof routes['campaigns.store']
    update: typeof routes['campaigns.update']
    replaceRecipients: typeof routes['campaigns.replace_recipients']
    softDelete: typeof routes['campaigns.soft_delete']
  }
  inboxEvents: {
    stream: typeof routes['inbox_events.stream']
  }
  conversations: {
    index: typeof routes['conversations.index']
    store: typeof routes['conversations.store']
    show: typeof routes['conversations.show']
    update: typeof routes['conversations.update']
    assign: typeof routes['conversations.assign']
    close: typeof routes['conversations.close']
    reopen: typeof routes['conversations.reopen']
  }
  messages: {
    index: typeof routes['messages.index']
    store: typeof routes['messages.store']
  }
  conversationAi: {
    takeover: typeof routes['conversation_ai.takeover']
    resume: typeof routes['conversation_ai.resume']
  }
  conversationNotes: {
    index: typeof routes['conversation_notes.index']
    store: typeof routes['conversation_notes.store']
  }
  billing: {
    listPlans: typeof routes['billing.list_plans']
    showSubscription: typeof routes['billing.show_subscription']
    showEntitlements: typeof routes['billing.show_entitlements']
    checkout: typeof routes['billing.checkout']
    verify: typeof routes['billing.verify']
  }
  notifications: {
    index: typeof routes['notifications.index']
    markAllAsRead: typeof routes['notifications.mark_all_as_read']
    markAsRead: typeof routes['notifications.mark_as_read']
  }
}
