import {
  callProtectedAs,
  callPublicAs,
  definedQuery,
  protectedBlobRequest,
  protectedJsonRequest,
  protectedTuyau,
  publicJsonRequest,
  publicTuyau,
  type CallOptions,
} from '@/lib/tuyau'


type WireArgs = {
  params?: Record<string, string | number>
  query?: Record<string, unknown>
  body?: unknown
  headers?: HeadersInit
  signal?: AbortSignal
  hooks?: CallOptions['hooks']
}

function wire(fn: (args: never) => Promise<unknown>): (args: WireArgs) => Promise<unknown> {
  return fn as unknown as (args: WireArgs) => Promise<unknown>
}

function queryOf(query: Record<string, unknown>) {
  const next = definedQuery(query)
  return Object.keys(next).length > 0 ? { query: next } : {}
}

function trimmed(value: string | undefined | null) {
  const next = value?.trim()
  return next ? next : undefined
}

function unlessAll(value: string | undefined) {
  return value && value !== 'all' ? value : undefined
}

function catalogQs(params: Record<string, unknown>) {
  const next = definedQuery(params)
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(next)) {
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

function auditQuery(params: {
  limit?: number
  organizationId?: string
  search?: string
  eventType?: string
  actorUserId?: string
  targetType?: string
  dateFrom?: string
  dateTo?: string
  includeFacets?: boolean
}) {
  return queryOf({
    limit: params.limit,
    organizationId: params.organizationId,
    search: trimmed(params.search),
    eventType: params.eventType,
    actorUserId: params.actorUserId,
    targetType: params.targetType,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    includeFacets: params.includeFacets ? 'true' : undefined,
  })
}

/**
 * JSON methods backed by Tuyau. Signatures and `{ data, response }` stay the
 * same so pages do not change. Better Auth and invoice PDF stay on fetch.
 */
export function createApi() {
  const pub = <T>(run: (client: typeof publicTuyau.api, options: CallOptions) => Promise<unknown>) =>
    callPublicAs<T>((options) => run(publicTuyau.api, options))

  const prot = <T>(
    run: (client: typeof protectedTuyau.api, options: CallOptions) => Promise<unknown>
  ) => callProtectedAs<T>((options) => run(protectedTuyau.api, options))

  return {
    auth: {
      signup: (body: SignupBody) =>
        pub<{ status: string }>((c, options) => wire(c.preSignup)({ body, ...options })),

      login: (body: LoginBody) =>
        publicJsonRequest('/api/auth/sign-in/email', {
          method: 'POST',
          body: JSON.stringify(body),
        }),

      verifyOtp: (body: { email: string; otp: string; password: string }) =>
        pub((c, options) => wire(c.verifySignup)({ body, ...options })),

      resendOtp: (body: { email: string }) =>
        pub<{ status: string }>((c, options) => wire(c.preSignup.resend)({ body, ...options })),

      forgotPassword: (body: { email: string; redirectTo?: string }) =>
        publicJsonRequest('/api/auth/request-password-reset', {
          method: 'POST',
          body: JSON.stringify({
            email: body.email,
            redirectTo: body.redirectTo ?? `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
          }),
        }),

      resetPassword: (body: { token: string; newPassword: string }) =>
        publicJsonRequest('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify(body),
        }),

      google: (callbackURL?: string) =>
        publicJsonRequest<{ url?: string; redirect?: boolean }>('/api/auth/sign-in/social', {
          method: 'POST',
          body: JSON.stringify({
            provider: 'google',
            callbackURL:
              callbackURL ??
              `${typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/onboarding/organization`,
          }),
        }),

      logout: () =>
        publicJsonRequest('/api/auth/sign-out', {
          method: 'POST',
        }),

      getSession: () =>
        publicJsonRequest<{ user: ProfileUser | null; session: unknown } | null>(
          '/api/auth/get-session',
          {
            method: 'GET',
            signal: AbortSignal.timeout(4000),
          }
        ),
    },

    demo: {
      availability: (params: { date: string; timeZone?: string }) =>
        pub<DemoAvailability>((c, options) =>
          wire(c.demoBookings.availability)({
            ...queryOf({ date: params.date, timeZone: params.timeZone }),
            ...options,
          })
        ),

      book: (body: CreateDemoBookingBody) =>
        pub<DemoBooking>((c, options) => wire(c.demoBookings.store)({ body, ...options })),
    },

    account: {
      profile: () =>
        prot<{ data?: ProfileUser } & ProfileUser>((c, options) => wire(c.profile.show)(options)),
    },

    onboarding: {
      state: () =>
        prot<{ data?: OnboardingState } & OnboardingState>((c, options) =>
          wire(c.onboarding.show)(options)
        ),
    },

    search: {
      query: (q: string) =>
        prot<{ data?: GlobalSearchResponse } & GlobalSearchResponse>((c, options) =>
          wire(c.globalSearch.index)({ ...queryOf({ q }), ...options })
        ),
    },

    organizations: {
      create: (body: CreateOrganizationBody) =>
        prot<{ data?: CreatedOrganization } & CreatedOrganization>((c, options) =>
          wire(c.organizations.store)({ body, ...options })
        ),

      list: () =>
        prot<{ data: OrganizationSummary[] }>((c, options) => wire(c.organizations.index)(options)),

      setActive: (organizationId: string) =>
        prot<{ data?: { organizationId: string } } & { organizationId: string }>((c, options) =>
          wire(c.organizations.setActive)({ params: { id: organizationId }, ...options })
        ),

      update: (organizationId: string, body: UpdateOrganizationBody) =>
        prot<{ data?: OrganizationDetails } & OrganizationDetails>((c, options) =>
          wire(c.organizations.update)({ params: { id: organizationId }, body, ...options })
        ),

      destroy: (organizationId: string) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.organizations.destroy)({ params: { id: organizationId }, ...options })
        ),

      getSmtp: (organizationId: string) =>
        prot<{ data: OrganizationSmtpConfig | null }>((c, options) =>
          wire(c.organizationSmtp.show)({ params: { id: organizationId }, ...options })
        ),

      updateSmtp: (organizationId: string, body: UpsertOrganizationSmtpBody) =>
        prot<{ data: OrganizationSmtpConfig }>((c, options) =>
          wire(c.organizationSmtp.update)({ params: { id: organizationId }, body, ...options })
        ),

      testSmtp: (organizationId: string, body?: TestOrganizationSmtpBody) =>
        prot<{ data: { ok: boolean } }>((c, options) =>
          wire(c.organizationSmtp.test)({
            params: { id: organizationId },
            body: body ?? {},
            ...options,
          })
        ),

      deleteSmtp: (organizationId: string) =>
        prot<{ data: { deleted: boolean } }>((c, options) =>
          wire(c.organizationSmtp.destroy)({ params: { id: organizationId }, ...options })
        ),
    },

    access: {
      context: () =>
        prot<{ data?: AccessContext } & AccessContext>((c, options) =>
          wire(c.accessContext.show)(options)
        ),
    },

    contacts: {
      list: (params: ListContactsParams = {}) =>
        prot<Paginated<ContactSummary>>((c, options) =>
          wire(c.contacts.index)({
            ...queryOf({
              page: params.page,
              perPage: params.perPage,
              search: trimmed(params.search),
            }),
            ...options,
          })
        ),

      create: (body: CreateContactBody) =>
        prot<{ data?: ContactSummary } & ContactSummary>((c, options) =>
          wire(c.contacts.store)({ body, ...options })
        ),

      get: (contactId: string) =>
        prot<{ data?: ContactSummary } & ContactSummary>((c, options) =>
          wire(c.contacts.show)({ params: { id: contactId }, ...options })
        ),

      update: (contactId: string, body: UpdateContactBody) =>
        prot<{ data?: ContactSummary } & ContactSummary>((c, options) =>
          wire(c.contacts.update)({ params: { id: contactId }, body, ...options })
        ),

      delete: (contactId: string) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.contacts.softDelete)({ params: { id: contactId }, ...options })
        ),

      importCsv: (body: ImportContactsBody) => {
        const form = new FormData()
        form.append('file', body.file)
        form.append('columnMapping', JSON.stringify(body.columnMapping))
        if (body.defaultCountryCode) {
          form.append('defaultCountryCode', body.defaultCountryCode)
        }
        return prot<{ data?: ContactImportResult } & ContactImportResult>((c, options) =>
          wire(c.contacts.importCsv)({ body: form, ...options })
        )
      },

      getImport: (importId: string) =>
        prot<{ data?: ContactImportResult } & ContactImportResult>((c, options) =>
          wire(c.contacts.showImport)({ params: { id: importId }, ...options })
        ),
    },

    tags: {
      list: () => prot<{ data: TagRecord[] }>((c, options) => wire(c.tags.index)(options)),

      get: (tagId: string) =>
        prot<{ data?: TagRecord } & TagRecord>((c, options) =>
          wire(c.tags.show)({ params: { id: tagId }, ...options })
        ),

      create: (body: CreateTagBody) =>
        prot<{ data?: TagRecord } & TagRecord>((c, options) =>
          wire(c.tags.store)({ body, ...options })
        ),

      update: (tagId: string, body: UpdateTagBody) =>
        prot<{ data?: TagRecord } & TagRecord>((c, options) =>
          wire(c.tags.update)({ params: { id: tagId }, body, ...options })
        ),

      delete: (tagId: string) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.tags.destroy)({ params: { id: tagId }, ...options })
        ),

      contacts: {
        list: (tagId: string) =>
          prot<{ data: ContactSummary[] }>((c, options) =>
            wire(c.tags.contacts)({ params: { id: tagId }, ...options })
          ),

        add: (tagId: string, body: AssignTagContactBody) =>
          prot<{ data?: TagAssignmentRecord } & TagAssignmentRecord>((c, options) =>
            wire(c.tags.assignContact)({ params: { id: tagId }, body, ...options })
          ),

        remove: (tagId: string, contactId: string) =>
          prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
            wire(c.tags.removeContact)({
              params: { id: tagId, contactId },
              ...options,
            })
          ),
      },
    },

    inbox: {
      listConversations: (params: ListInboxConversationsParams = {}) =>
        prot<Paginated<InboxConversation>>((c, options) =>
          wire(c.conversations.index)({
            ...queryOf({
              status: params.status,
              assignedAgentId: params.assignedAgentId,
              search: trimmed(params.search),
              page: params.page,
              limit: params.limit,
            }),
            ...options,
          })
        ),

      createConversation: (body: CreateInboxConversationBody) =>
        prot<{ data?: InboxConversation } & InboxConversation>((c, options) =>
          wire(c.conversations.store)({ body, ...options })
        ),

      getConversation: (conversationId: string) =>
        prot<{ data?: InboxConversation } & InboxConversation>((c, options) =>
          wire(c.conversations.show)({ params: { id: conversationId }, ...options })
        ),

      listMessages: (conversationId: string, params: ListInboxMessagesParams = {}) =>
        prot<Paginated<InboxMessage>>((c, options) =>
          wire(c.messages.index)({
            params: { id: conversationId },
            ...queryOf({ page: params.page, limit: params.limit }),
            ...options,
          })
        ),

      sendMessage: (conversationId: string, body: SendInboxMessageBody, idempotencyKey: string) =>
        prot<{ data?: InboxMessage } & InboxMessage>((c, options) =>
          wire(c.messages.store)({
            params: { id: conversationId },
            body,
            ...options,
            headers: { 'Idempotency-Key': idempotencyKey },
          })
        ),

      assignConversation: (conversationId: string, body: AssignInboxConversationBody) =>
        prot<{ data?: InboxConversation } & InboxConversation>((c, options) =>
          wire(c.conversations.assign)({ params: { id: conversationId }, body, ...options })
        ),

      closeConversation: (conversationId: string) =>
        prot<{ data?: InboxConversation } & InboxConversation>((c, options) =>
          wire(c.conversations.close)({ params: { id: conversationId }, ...options })
        ),

      reopenConversation: (conversationId: string) =>
        prot<{ data?: InboxConversation } & InboxConversation>((c, options) =>
          wire(c.conversations.reopen)({ params: { id: conversationId }, ...options })
        ),

      updateConversation: (conversationId: string, body: UpdateInboxConversationBody) =>
        prot<{ data?: InboxConversation } & InboxConversation>((c, options) =>
          wire(c.conversations.update)({ params: { id: conversationId }, body, ...options })
        ),

      listNotes: (conversationId: string) =>
        prot<{ data: InboxConversationNote[] }>((c, options) =>
          wire(c.conversationNotes.index)({ params: { id: conversationId }, ...options })
        ),

      createNote: (conversationId: string, body: CreateInboxConversationNoteBody) =>
        prot<{ data?: InboxConversationNote } & InboxConversationNote>((c, options) =>
          wire(c.conversationNotes.store)({ params: { id: conversationId }, body, ...options })
        ),

      takeoverAi: (conversationId: string) =>
        prot<{ data?: InboxAiModePatch } & InboxAiModePatch>((c, options) =>
          wire(c.conversationAi.takeover)({ params: { id: conversationId }, ...options })
        ),

      resumeAi: (conversationId: string) =>
        prot<{ data?: InboxAiModePatch } & InboxAiModePatch>((c, options) =>
          wire(c.conversationAi.resume)({ params: { id: conversationId }, ...options })
        ),
    },

    notifications: {
      list: (params: ListNotificationsParams = {}) =>
        prot<Paginated<Notification>>((c, options) =>
          wire(c.notifications.index)({
            ...queryOf({ page: params.page, limit: params.limit }),
            ...options,
          })
        ),

      markAsRead: (notificationId: string) =>
        prot<{ data?: Notification } & Notification>((c, options) =>
          wire(c.notifications.markAsRead)({ params: { id: notificationId }, ...options })
        ),

      markAllAsRead: () =>
        prot<{ data?: MarkAllNotificationsReadResult } & MarkAllNotificationsReadResult>(
          (c, options) => wire(c.notifications.markAllAsRead)(options)
        ),
    },

    whatsapp: {
      listConfigs: () =>
        prot<{ data: WhatsappConfigSummary[] }>((c, options) =>
          wire(c.whatsappConfigs.index)(options)
        ),

      getConfig: (configId: string) =>
        prot<{ data?: WhatsappConfigSummary } & WhatsappConfigSummary>((c, options) =>
          wire(c.whatsappConfigs.show)({ params: { id: configId }, ...options })
        ),

      disconnectConfig: (configId: string) =>
        prot<{ data?: WhatsappConfigSummary } & WhatsappConfigSummary>((c, options) =>
          wire(c.whatsappConfigs.destroy)({ params: { id: configId }, ...options })
        ),

      testConfig: (configId: string, body: TestWhatsappConfigBody) =>
        prot<{ data?: TestWhatsappConfigResult } & TestWhatsappConfigResult>((c, options) =>
          wire(c.whatsappConfigs.test)({ params: { id: configId }, body, ...options })
        ),

      getEmbeddedSignupSession: () =>
        prot<{ data?: WhatsappEmbeddedSignupSession } & WhatsappEmbeddedSignupSession>(
          (c, options) => wire(c.whatsappEmbeddedSignup.session)(options)
        ),

      completeEmbeddedSignup: (body: CompleteWhatsappEmbeddedSignupBody) =>
        prot<{ data?: WhatsappConfigSummary } & WhatsappConfigSummary>((c, options) =>
          wire(c.whatsappEmbeddedSignup.complete)({ body, ...options })
        ),

      listTemplates: (params: ListWhatsappTemplatesParams = {}) =>
        prot<Paginated<WhatsappMessageTemplate>>((c, options) =>
          wire(c.messageTemplates.index)({
            ...queryOf({
              page: params.page,
              perPage: params.perPage,
              status: params.status,
              category: params.category,
              search: trimmed(params.search),
              language: trimmed(params.language),
            }),
            ...options,
          })
        ),

      getTemplate: (templateId: string) =>
        prot<{ data?: WhatsappMessageTemplate } & WhatsappMessageTemplate>((c, options) =>
          wire(c.messageTemplates.show)({ params: { id: templateId }, ...options })
        ),

      createTemplate: (body: CreateWhatsappTemplateBody) =>
        prot<{ data?: WhatsappMessageTemplate } & WhatsappMessageTemplate>((c, options) =>
          wire(c.messageTemplates.store)({ body, ...options })
        ),

      syncTemplates: () =>
        prot<{ data?: SyncWhatsappTemplatesResult } & SyncWhatsappTemplatesResult>((c, options) =>
          wire(c.messageTemplates.sync)(options)
        ),

      deleteTemplate: (templateId: string) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.messageTemplates.destroy)({ params: { id: templateId }, ...options })
        ),
    },

    integrations: {
      list: () =>
        prot<{ data: IntegrationConnection[] }>((c, options) =>
          wire(c.integrationConnections.index)(options)
        ),

      upsert: (provider: string, body: UpsertIntegrationConnectionBody) =>
        prot<{ data?: IntegrationConnection } & IntegrationConnection>((c, options) =>
          wire(c.integrationConnections.upsert)({ params: { provider }, body, ...options })
        ),

      destroy: (provider: string) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.integrationConnections.destroy)({ params: { provider }, ...options })
        ),
    },

    apiKeys: {
      list: () =>
        prot<{ data: IntegrationApiKey[] }>((c, options) => wire(c.apiKeys.index)(options)),

      create: (body: CreateIntegrationApiKeyBody) =>
        prot<{ data?: IntegrationApiKey } & IntegrationApiKey>((c, options) =>
          wire(c.apiKeys.store)({ body, ...options })
        ),

      revoke: (id: string) =>
        prot<{ data?: IntegrationApiKey } & IntegrationApiKey>((c, options) =>
          wire(c.apiKeys.revoke)({ params: { id }, ...options })
        ),
    },

    knowledgeDocuments: {
      list: (params: ListKnowledgeDocumentsParams = {}) =>
        prot<Paginated<KnowledgeDocument>>((c, options) =>
          wire(c.knowledgeDocuments.index)({
            ...queryOf({
              page: params.page,
              perPage: params.perPage,
              status: params.status,
              lifecycle: params.lifecycle,
            }),
            ...options,
          })
        ),

      get: (documentId: string) =>
        prot<{ data?: KnowledgeDocument } & KnowledgeDocument>((c, options) =>
          wire(c.knowledgeDocuments.show)({ params: { id: documentId }, ...options })
        ),

      create: (body: CreateKnowledgeDocumentBody) =>
        prot<{ data?: CreateKnowledgeDocumentResult } & CreateKnowledgeDocumentResult>(
          (c, options) => wire(c.knowledgeDocuments.store)({ body, ...options })
        ),

      completeUpload: (documentId: string) =>
        prot<{ data?: KnowledgeDocument } & KnowledgeDocument>((c, options) =>
          wire(c.knowledgeDocuments.completeUpload)({ params: { id: documentId }, ...options })
        ),

      delete: (documentId: string) =>
        prot<{ data?: KnowledgeDocument } & KnowledgeDocument>((c, options) =>
          wire(c.knowledgeDocuments.destroy)({ params: { id: documentId }, ...options })
        ),

      restore: (documentId: string) =>
        prot<{ data?: KnowledgeDocument } & KnowledgeDocument>((c, options) =>
          wire(c.knowledgeDocuments.restore)({ params: { id: documentId }, ...options })
        ),

      purge: (documentId: string) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.knowledgeDocuments.purge)({ params: { id: documentId }, ...options })
        ),
    },

    flows: {
      list: (params: ListConversationFlowsParams = {}) =>
        prot<Paginated<ConversationFlow>>((c, options) =>
          wire(c.flows.index)({
            ...queryOf({
              page: params.page,
              perPage: params.perPage,
              status: params.status,
              search: trimmed(params.search),
            }),
            ...options,
          })
        ),

      get: (flowId: string) =>
        prot<{ data?: ConversationFlow } & ConversationFlow>((c, options) =>
          wire(c.flows.show)({ params: { id: flowId }, ...options })
        ),

      create: (body: CreateConversationFlowBody) =>
        prot<{ data?: ConversationFlow } & ConversationFlow>((c, options) =>
          wire(c.flows.store)({ body, ...options })
        ),

      update: (flowId: string, body: UpdateConversationFlowBody) =>
        prot<{ data?: ConversationFlow } & ConversationFlow>((c, options) =>
          wire(c.flows.update)({ params: { id: flowId }, body, ...options })
        ),

      validate: (flowId: string, body: UpdateConversationFlowBody = {}) =>
        prot<{ data?: ConversationFlowValidateResult } & ConversationFlowValidateResult>(
          (c, options) => wire(c.flows.validate)({ params: { id: flowId }, body, ...options })
        ),

      publish: (flowId: string) =>
        prot<{ data?: ConversationFlow } & ConversationFlow>((c, options) =>
          wire(c.flows.publish)({ params: { id: flowId }, ...options })
        ),

      delete: (flowId: string) =>
        prot<{ data?: ConversationFlow } & ConversationFlow>((c, options) =>
          wire(c.flows.destroy)({ params: { id: flowId }, ...options })
        ),
    },

    templateCatalog: {
      list: (params: ListPlatformTemplateCatalogParams = {}) =>
        protectedJsonRequest<Paginated<PlatformTemplateCatalogItem>>(
          `/api/v1/template-catalog${catalogQs({
            page: params.page,
            perPage: params.perPage,
            search: trimmed(params.search),
            category: params.category,
            language: trimmed(params.language),
            industry: trimmed(params.industry),
            topic: trimmed(params.topic),
          })}`
        ),

      install: (id: string) =>
        protectedJsonRequest<{ data?: WhatsappMessageTemplate } & WhatsappMessageTemplate>(
          `/api/v1/template-catalog/${id}/install`,
          { method: 'POST' }
        ),
    },

    flowCatalog: {
      list: (params: ListPlatformFlowCatalogParams = {}) =>
        protectedJsonRequest<Paginated<PlatformFlowCatalogItem>>(
          `/api/v1/flow-catalog${catalogQs({
            page: params.page,
            perPage: params.perPage,
            search: trimmed(params.search),
          })}`
        ),

      install: (id: string) =>
        protectedJsonRequest<{ data?: ConversationFlow } & ConversationFlow>(
          `/api/v1/flow-catalog/${id}/install`,
          { method: 'POST' }
        ),
    },

    media: {
      list: (params: ListMediaParams = {}) =>
        prot<Paginated<MediaAsset>>((c, options) =>
          wire(c.mediaAssets.index)({
            ...queryOf({
              page: params.page,
              perPage: params.perPage,
              kind: params.kind,
              state: params.state,
              search: trimmed(params.search),
            }),
            ...options,
          })
        ),

      quota: () =>
        prot<{ data?: MediaQuota } & MediaQuota>((c, options) =>
          wire(c.mediaAssets.quota)(options)
        ),

      organizationLogo: () =>
        prot<{ data?: MediaAsset | null } & { data?: MediaAsset | null }>((c, options) =>
          wire(c.mediaAssets.organizationLogo)(options)
        ),

      get: (mediaAssetId: string) =>
        prot<{ data?: MediaAsset } & MediaAsset>((c, options) =>
          wire(c.mediaAssets.show)({ params: { id: mediaAssetId }, ...options })
        ),

      initiateUpload: (body: InitiateMediaUploadBody) =>
        prot<{ data?: InitiateMediaUploadResult } & InitiateMediaUploadResult>((c, options) =>
          wire(c.mediaUploads.store)({ body, ...options })
        ),

      completeUpload: (mediaAssetId: string) =>
        prot<{ data?: MediaAsset } & MediaAsset>((c, options) =>
          wire(c.mediaUploads.complete)({ params: { id: mediaAssetId }, ...options })
        ),

      softDelete: (mediaAssetId: string) =>
        prot<{ data?: MediaAsset } & MediaAsset>((c, options) =>
          wire(c.mediaAssets.destroy)({ params: { id: mediaAssetId }, ...options })
        ),

      restore: (mediaAssetId: string) =>
        prot<{ data?: MediaAsset } & MediaAsset>((c, options) =>
          wire(c.mediaAssets.restore)({ params: { id: mediaAssetId }, ...options })
        ),

      purge: (mediaAssetId: string) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.mediaAssets.purge)({ params: { id: mediaAssetId }, ...options })
        ),
    },

    billing: {
      getSubscription: () =>
        prot<{ data?: BillingSubscription } & BillingSubscription>((c, options) =>
          wire(c.billing.showSubscription)(options)
        ),

      listPlans: () =>
        prot<{ data?: { items: TenantBillingPlan[] } }>((c, options) =>
          wire(c.billing.listPlans)(options)
        ),

      entitlements: () =>
        prot<{ data?: BillingEntitlementsSnapshot } & BillingEntitlementsSnapshot>((c, options) =>
          wire(c.billing.showEntitlements)(options)
        ),

      checkout: (body: BillingCheckoutBody) =>
        prot<{ data?: BillingCheckoutResult } & BillingCheckoutResult>((c, options) =>
          wire(c.billing.checkout)({ body, ...options })
        ),

      verify: (body: BillingVerifyBody) =>
        prot<{ data?: BillingVerifyResult } & BillingVerifyResult>((c, options) =>
          wire(c.billing.verify)({ body, ...options })
        ),
    },

    campaigns: {
      list: (params: ListCampaignsParams = {}) =>
        prot<Paginated<Campaign>>((c, options) =>
          wire(c.campaigns.index)({
            ...queryOf({
              page: params.page,
              limit: params.limit,
              perPage: params.perPage,
              search: trimmed(params.search),
              status: params.status,
              startDate: trimmed(params.startDate),
              endDate: trimmed(params.endDate),
              sortBy: params.sortBy,
              sortOrder: params.sortOrder,
            }),
            ...options,
          })
        ),

      get: (campaignId: string) =>
        prot<{ data?: Campaign } & Campaign>((c, options) =>
          wire(c.campaigns.show)({ params: { id: campaignId }, ...options })
        ),

      create: (body: CreateCampaignBody) =>
        prot<{ data?: Campaign } & Campaign>((c, options) =>
          wire(c.campaigns.store)({ body, ...options })
        ),

      update: (campaignId: string, body: UpdateCampaignBody) =>
        prot<{ data?: Campaign } & Campaign>((c, options) =>
          wire(c.campaigns.update)({ params: { id: campaignId }, body, ...options })
        ),

      delete: (campaignId: string) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.campaigns.softDelete)({ params: { id: campaignId }, ...options })
        ),

      replaceRecipients: (campaignId: string, body: ReplaceCampaignRecipientsBody) =>
        prot<{ data?: Campaign } & Campaign>((c, options) =>
          wire(c.campaigns.replaceRecipients)({ params: { id: campaignId }, body, ...options })
        ),

      schedule: (campaignId: string, body: { scheduledAt: string }) =>
        prot<{ data?: Campaign } & Campaign>((c, options) =>
          wire(c.campaigns.schedule)({ params: { id: campaignId }, body, ...options })
        ),

      send: (campaignId: string) =>
        prot<{ data?: Campaign } & Campaign>((c, options) =>
          wire(c.campaigns.send)({ params: { id: campaignId }, ...options })
        ),

      cancel: (campaignId: string) =>
        prot<{ data?: Campaign } & Campaign>((c, options) =>
          wire(c.campaigns.cancel)({ params: { id: campaignId }, ...options })
        ),

      preview: (campaignId: string, body: { variables?: Record<string, string> } = {}) =>
        prot<{ data?: CampaignPreview } & CampaignPreview>((c, options) =>
          wire(c.campaigns.preview)({ params: { id: campaignId }, body, ...options })
        ),

      duplicate: (campaignId: string) =>
        prot<{ data?: Campaign } & Campaign>((c, options) =>
          wire(c.campaigns.duplicate)({ params: { id: campaignId }, ...options })
        ),
    },

    members: {
      list: () =>
        prot<{ data: OrganizationMember[] }>((c, options) => wire(c.members.index)(options)),

      assignRole: (memberId: string, role: string) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.members.assignRole)({ params: { memberId }, body: { role }, ...options })
        ),

      remove: (memberId: string) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.members.remove)({ params: { memberId }, ...options })
        ),

      resendInvite: (memberId: string) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.members.resendInvite)({ params: { memberId }, ...options })
        ),
    },

    ownership: {
      transfer: (body: TransferOwnershipBody) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.ownership.transfer)({ body, ...options })
        ),
    },

    audit: {
      list: (params: ListAuditParams = {}) =>
        prot<AuditListPayload>((c, options) =>
          wire(c.audit.index)({ ...auditQuery(params), ...options })
        ),
    },

    analytics: {
      summary: () =>
        prot<{ data?: TenantAnalyticsSummary } & TenantAnalyticsSummary>((c, options) =>
          wire(c.analytics.summary)(options)
        ),
    },

    organizationAdmin: {
      listUsers: (params: ListOrganizationAdminUsersParams = {}) =>
        prot<Paginated<OrganizationAdminUser>>((c, options) =>
          wire(c.organizationAdminUsers.index)({
            ...queryOf({
              page: params.page,
              perPage: params.perPage,
              search: trimmed(params.search),
              role: trimmed(params.role),
            }),
            ...options,
          })
        ),

      getUser: (userId: string) =>
        prot<{ data?: OrganizationAdminUser } & OrganizationAdminUser>((c, options) =>
          wire(c.organizationAdminUsers.show)({ params: { id: userId }, ...options })
        ),

      updateUser: (userId: string, body: UpdateOrganizationAdminUserBody) =>
        prot<{ data?: OrganizationAdminUser } & OrganizationAdminUser>((c, options) =>
          wire(c.organizationAdminUsers.update)({ params: { id: userId }, body, ...options })
        ),

      softDeleteUser: (userId: string) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.organizationAdminUsers.softDelete)({ params: { id: userId }, ...options })
        ),
    },

    invitations: {
      create: (organizationId: string, body: CreateInvitationBody) =>
        prot<{ data?: CreatedInvitation } & CreatedInvitation>((c, options) =>
          wire(c.invitations.store)({ params: { id: organizationId }, body, ...options })
        ),
    },

    roles: {
      list: () => prot<{ data: OrganizationRole[] }>((c, options) => wire(c.roles.index)(options)),

      create: (body: CreateRoleBody) =>
        prot<{ data?: { role: string } } & { role: string }>((c, options) =>
          wire(c.roles.create)({ body, ...options })
        ),

      preview: (roleKey: string, body: { permissions: string[] }) =>
        prot<{ data?: RoleUpdatePreview } & RoleUpdatePreview>((c, options) =>
          wire(c.roles.preview)({ params: { roleKey }, body, ...options })
        ),

      update: (roleKey: string, body: UpdateRoleBody) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.roles.update)({ params: { roleKey }, body, ...options })
        ),

      reset: (roleKey: string, body: ResetRoleBody) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.roles.reset)({ params: { roleKey }, body, ...options })
        ),

      destroy: (roleKey: string, body: DeleteRoleBody) =>
        prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
          wire(c.roles.destroy)({ params: { roleKey }, body, ...options })
        ),
    },

    superAdmin: {
      search: {
        query: (q: string) =>
          prot<{ data?: GlobalSearchResponse } & GlobalSearchResponse>((c, options) =>
            wire(c.superAdminSearch.index)({ ...queryOf({ q }), ...options })
          ),
      },

      organizations: {
        list: (params: { page?: number; perPage?: number } = {}) =>
          prot<Paginated<SuperAdminOrganization>>((c, options) =>
            wire(c.superAdminOrganizations.index)({
              ...queryOf({ page: params.page, perPage: params.perPage }),
              ...options,
            })
          ),

        get: (organizationId: string) =>
          prot<{ data?: SuperAdminOrganization } & SuperAdminOrganization>((c, options) =>
            wire(c.superAdminOrganizations.show)({ params: { id: organizationId }, ...options })
          ),

        update: (organizationId: string, body: UpdateSuperAdminOrganizationBody) =>
          prot<{ data?: SuperAdminOrganization } & SuperAdminOrganization>((c, options) =>
            wire(c.superAdminOrganizations.update)({
              params: { id: organizationId },
              body,
              ...options,
            })
          ),

        suspend: (organizationId: string) =>
          prot<{ data?: SuperAdminOrganization } & SuperAdminOrganization>((c, options) =>
            wire(c.superAdminOrganizations.suspend)({ params: { id: organizationId }, ...options })
          ),

        activate: (organizationId: string) =>
          prot<{ data?: SuperAdminOrganization } & SuperAdminOrganization>((c, options) =>
            wire(c.superAdminOrganizations.activate)({ params: { id: organizationId }, ...options })
          ),

        destroy: (organizationId: string) =>
          prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
            wire(c.superAdminOrganizations.softDelete)({
              params: { id: organizationId },
              ...options,
            })
          ),
      },

      subscriptions: {
        list: (params: ListSuperAdminSubscriptionsParams = {}) =>
          prot<Paginated<SuperAdminSubscription> & { summary?: SuperAdminSubscriptionListSummary }>(
            (c, options) =>
              wire(c.superAdminSubscriptions.index)({
                ...queryOf({
                  page: params.page,
                  perPage: params.perPage,
                  search: trimmed(params.search),
                  status: unlessAll(params.status),
                  plan: trimmed(params.plan),
                  billing: unlessAll(params.billing),
                }),
                ...options,
              })
          ),

        get: (subscriptionId: string) =>
          prot<{ data?: SuperAdminSubscription } & SuperAdminSubscription>((c, options) =>
            wire(c.superAdminSubscriptions.show)({ params: { id: subscriptionId }, ...options })
          ),

        create: (body: CreateSuperAdminSubscriptionBody) =>
          prot<{ data?: SuperAdminSubscription } & SuperAdminSubscription>((c, options) =>
            wire(c.superAdminSubscriptions.store)({ body, ...options })
          ),

        update: (subscriptionId: string, body: UpdateSuperAdminSubscriptionBody) =>
          prot<{ data?: SuperAdminSubscription } & SuperAdminSubscription>((c, options) =>
            wire(c.superAdminSubscriptions.update)({
              params: { id: subscriptionId },
              body,
              ...options,
            })
          ),

        destroy: (subscriptionId: string) =>
          prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
            wire(c.superAdminSubscriptions.softDelete)({
              params: { id: subscriptionId },
              ...options,
            })
          ),
      },

      plans: {
        list: (params: ListSuperAdminPlansParams = {}) =>
          prot<{ data?: { items: SuperAdminPlan[]; summary: SuperAdminPlanSummary } }>(
            (c, options) =>
              wire(c.superAdminPlans.index)({
                ...queryOf({
                  search: trimmed(params.search),
                  status: unlessAll(params.status),
                }),
                ...options,
              })
          ),

        get: (planId: string) =>
          prot<{ data?: SuperAdminPlan } & SuperAdminPlan>((c, options) =>
            wire(c.superAdminPlans.show)({ params: { id: planId }, ...options })
          ),

        create: (body: CreateSuperAdminPlanBody) =>
          prot<{ data?: SuperAdminPlan } & SuperAdminPlan>((c, options) =>
            wire(c.superAdminPlans.store)({ body, ...options })
          ),

        update: (planId: string, body: UpdateSuperAdminPlanBody) =>
          prot<{ data?: SuperAdminPlan } & SuperAdminPlan>((c, options) =>
            wire(c.superAdminPlans.update)({ params: { id: planId }, body, ...options })
          ),

        destroy: (planId: string) =>
          prot<{ data?: SuperAdminPlan } & SuperAdminPlan>((c, options) =>
            wire(c.superAdminPlans.softDelete)({ params: { id: planId }, ...options })
          ),
      },

      invoices: {
        list: (params: ListSuperAdminInvoicesParams = {}) =>
          prot<Paginated<SuperAdminInvoice>>((c, options) =>
            wire(c.superAdminInvoices.index)({
              ...queryOf({
                page: params.page,
                perPage: params.perPage,
                search: trimmed(params.search),
                status: unlessAll(params.status),
                issueMonth: unlessAll(params.issueMonth),
                billingPeriod: unlessAll(params.billingPeriod),
              }),
              ...options,
            })
          ),

        summary: (params: Omit<ListSuperAdminInvoicesParams, 'page' | 'perPage'> = {}) =>
          prot<{ data?: SuperAdminInvoiceSummary } & SuperAdminInvoiceSummary>((c, options) =>
            wire(c.superAdminInvoices.summary)({
              ...queryOf({
                search: trimmed(params.search),
                status: unlessAll(params.status),
                issueMonth: unlessAll(params.issueMonth),
                billingPeriod: unlessAll(params.billingPeriod),
              }),
              ...options,
            })
          ),

        billingProfile: () =>
          prot<{ data?: SuperAdminInvoiceBillingProfile } & SuperAdminInvoiceBillingProfile>(
            (c, options) => wire(c.superAdminInvoices.billingProfile)(options)
          ),

        get: (invoiceId: string) =>
          prot<{ data?: SuperAdminInvoice } & SuperAdminInvoice>((c, options) =>
            wire(c.superAdminInvoices.show)({ params: { id: invoiceId }, ...options })
          ),

        create: (body: CreateSuperAdminInvoiceBody) =>
          prot<{ data?: SuperAdminInvoice } & SuperAdminInvoice>((c, options) =>
            wire(c.superAdminInvoices.store)({ body, ...options })
          ),

        markPaid: (invoiceId: string, body: MarkSuperAdminInvoicePaidBody = {}) =>
          prot<{ data?: SuperAdminInvoice } & SuperAdminInvoice>((c, options) =>
            wire(c.superAdminInvoices.markPaid)({ params: { id: invoiceId }, body, ...options })
          ),

        regenerate: (invoiceId: string) =>
          prot<{ data?: SuperAdminInvoice } & SuperAdminInvoice>((c, options) =>
            wire(c.superAdminInvoices.regenerate)({
              params: { id: invoiceId },
              body: {},
              ...options,
            })
          ),

        send: (invoiceId: string) =>
          prot<{ data?: { ok: boolean } } & { ok: boolean }>((c, options) =>
            wire(c.superAdminInvoices.send)({
              params: { id: invoiceId },
              body: {},
              ...options,
            })
          ),

        download: (invoiceId: string) =>
          protectedBlobRequest(`/api/v1/super-admin/invoices/${invoiceId}/download`, {
            method: 'GET',
          }),
      },

      aiConfig: {
        get: () =>
          prot<{ data?: PlatformAiConfig } & PlatformAiConfig>((c, options) =>
            wire(c.superAdminAiConfig.show)(options)
          ),

        update: (body: UpdatePlatformAiConfigBody) =>
          prot<{ data?: PlatformAiConfig } & PlatformAiConfig>((c, options) =>
            wire(c.superAdminAiConfig.update)({ body, ...options })
          ),
      },

      platformSettings: {
        get: () =>
          prot<{ data?: PlatformSettings } & PlatformSettings>((c, options) =>
            wire(c.superAdminPlatformSettings.show)(options)
          ),

        update: (body: UpdatePlatformSettingsBody) =>
          prot<{ data?: PlatformSettings } & PlatformSettings>((c, options) =>
            wire(c.superAdminPlatformSettings.update)({ body, ...options })
          ),
      },

      auditLogs: {
        list: (params: ListAuditParams = {}) =>
          prot<AuditListPayload>((c, options) =>
            wire(c.superAdminAudit.index)({ ...auditQuery(params), ...options })
          ),
      },

      analytics: {
        summary: () =>
          prot<{ data?: PlatformAnalyticsSummary } & PlatformAnalyticsSummary>((c, options) =>
            wire(c.superAdminAnalytics.summary)(options)
          ),
      },

      platformUsers: {
        list: (params: ListSuperAdminPlatformUsersParams = {}) =>
          prot<Paginated<SuperAdminPlatformUser>>((c, options) =>
            wire(c.superAdminPlatformUsers.index)({
              ...queryOf({
                page: params.page,
                perPage: params.perPage,
                search: trimmed(params.search),
                status: unlessAll(params.status),
                organizationId: params.organizationId,
                role: trimmed(params.role),
              }),
              ...options,
            })
          ),
      },

      templateLibrary: {
        list: (params: ListPlatformTemplateCatalogParams & { usecase?: string; after?: string } = {}) =>
          protectedJsonRequest<MetaTemplateLibraryList>(
            `/api/v1/super-admin/template-library${catalogQs({
              search: trimmed(params.search),
              category: params.category,
              language: trimmed(params.language),
              industry: trimmed(params.industry),
              topic: trimmed(params.topic),
              usecase: trimmed(params.usecase),
              after: trimmed(params.after),
            })}`
          ),
      },

      templateCatalog: {
        list: (params: ListPlatformTemplateCatalogParams = {}) =>
          protectedJsonRequest<Paginated<PlatformTemplateCatalogItem>>(
            `/api/v1/super-admin/template-catalog${catalogQs({
              page: params.page,
              perPage: params.perPage,
              search: trimmed(params.search),
              category: params.category,
              language: trimmed(params.language),
              industry: trimmed(params.industry),
              topic: trimmed(params.topic),
              status: params.status,
              source: params.source,
            })}`
          ),

        get: (id: string) =>
          protectedJsonRequest<{ data?: PlatformTemplateCatalogItem } & PlatformTemplateCatalogItem>(
            `/api/v1/super-admin/template-catalog/${id}`
          ),

        create: (body: CreatePlatformTemplateCatalogBody) =>
          protectedJsonRequest<{ data?: PlatformTemplateCatalogItem } & PlatformTemplateCatalogItem>(
            '/api/v1/super-admin/template-catalog',
            { method: 'POST', body: JSON.stringify(body) }
          ),

        importItems: (items: MetaTemplateLibraryItem[]) =>
          protectedJsonRequest<{
            data?: {
              imported: PlatformTemplateCatalogItem[]
              skipped: Array<{ name: string; reason: string }>
            }
          }>(
            '/api/v1/super-admin/template-catalog/import',
            { method: 'POST', body: JSON.stringify({ items }) }
          ),

        update: (id: string, body: Partial<CreatePlatformTemplateCatalogBody> & { sortOrder?: number }) =>
          protectedJsonRequest<{ data?: PlatformTemplateCatalogItem } & PlatformTemplateCatalogItem>(
            `/api/v1/super-admin/template-catalog/${id}`,
            { method: 'PATCH', body: JSON.stringify(body) }
          ),

        publish: (id: string) =>
          protectedJsonRequest<{ data?: PlatformTemplateCatalogItem } & PlatformTemplateCatalogItem>(
            `/api/v1/super-admin/template-catalog/${id}/publish`,
            { method: 'POST' }
          ),

        archive: (id: string) =>
          protectedJsonRequest<{ data?: PlatformTemplateCatalogItem } & PlatformTemplateCatalogItem>(
            `/api/v1/super-admin/template-catalog/${id}`,
            { method: 'DELETE' }
          ),
      },

      flowCatalog: {
        list: (params: ListPlatformFlowCatalogParams = {}) =>
          protectedJsonRequest<Paginated<PlatformFlowCatalogItem>>(
            `/api/v1/super-admin/flow-catalog${catalogQs({
              page: params.page,
              perPage: params.perPage,
              search: trimmed(params.search),
              status: params.status,
            })}`
          ),

        get: (id: string) =>
          protectedJsonRequest<{ data?: PlatformFlowCatalogItem } & PlatformFlowCatalogItem>(
            `/api/v1/super-admin/flow-catalog/${id}`
          ),

        create: (body: CreatePlatformFlowCatalogBody) =>
          protectedJsonRequest<{ data?: PlatformFlowCatalogItem } & PlatformFlowCatalogItem>(
            '/api/v1/super-admin/flow-catalog',
            { method: 'POST', body: JSON.stringify(body) }
          ),

        update: (id: string, body: UpdateConversationFlowBody & { extraRequiredFeatureKeys?: string[] }) =>
          protectedJsonRequest<{ data?: PlatformFlowCatalogItem } & PlatformFlowCatalogItem>(
            `/api/v1/super-admin/flow-catalog/${id}`,
            { method: 'PATCH', body: JSON.stringify(body) }
          ),

        validate: (id: string, body: UpdateConversationFlowBody = {}) =>
          protectedJsonRequest<
            { data?: ConversationFlowValidateResult } & ConversationFlowValidateResult
          >(`/api/v1/super-admin/flow-catalog/${id}/validate`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),

        publish: (id: string) =>
          protectedJsonRequest<{ data?: PlatformFlowCatalogItem } & PlatformFlowCatalogItem>(
            `/api/v1/super-admin/flow-catalog/${id}/publish`,
            { method: 'POST' }
          ),

        archive: (id: string) =>
          protectedJsonRequest<{ data?: PlatformFlowCatalogItem } & PlatformFlowCatalogItem>(
            `/api/v1/super-admin/flow-catalog/${id}`,
            { method: 'DELETE' }
          ),
      },
    },
  }
}

type SignupBody = import('@/lib/api').SignupBody
type LoginBody = import('@/lib/api').LoginBody
type ProfileUser = import('@/lib/api').ProfileUser
type DemoAvailability = import('@/lib/api').DemoAvailability
type CreateDemoBookingBody = import('@/lib/api').CreateDemoBookingBody
type DemoBooking = import('@/lib/api').DemoBooking
type OnboardingState = import('@/lib/api').OnboardingState
type GlobalSearchResponse = import('@/lib/api').GlobalSearchResponse
type CreateOrganizationBody = import('@/lib/api').CreateOrganizationBody
type CreatedOrganization = import('@/lib/api').CreatedOrganization
type OrganizationSummary = import('@/lib/api').OrganizationSummary
type UpdateOrganizationBody = import('@/lib/api').UpdateOrganizationBody
type OrganizationDetails = import('@/lib/api').OrganizationDetails
type OrganizationSmtpConfig = import('@/lib/api').OrganizationSmtpConfig
type UpsertOrganizationSmtpBody = import('@/lib/api').UpsertOrganizationSmtpBody
type TestOrganizationSmtpBody = import('@/lib/api').TestOrganizationSmtpBody
type AccessContext = import('@/lib/api').AccessContext
type ListContactsParams = import('@/lib/api').ListContactsParams
type Paginated<T> = import('@/lib/api').Paginated<T>
type ContactSummary = import('@/lib/api').ContactSummary
type CreateContactBody = import('@/lib/api').CreateContactBody
type UpdateContactBody = import('@/lib/api').UpdateContactBody
type ImportContactsBody = import('@/lib/api').ImportContactsBody
type ContactImportResult = import('@/lib/api').ContactImportResult
type TagRecord = import('@/lib/api').TagRecord
type CreateTagBody = import('@/lib/api').CreateTagBody
type UpdateTagBody = import('@/lib/api').UpdateTagBody
type AssignTagContactBody = import('@/lib/api').AssignTagContactBody
type TagAssignmentRecord = import('@/lib/api').TagAssignmentRecord
type ListInboxConversationsParams = import('@/lib/api').ListInboxConversationsParams
type InboxConversation = import('@/lib/api').InboxConversation
type CreateInboxConversationBody = import('@/lib/api').CreateInboxConversationBody
type ListInboxMessagesParams = import('@/lib/api').ListInboxMessagesParams
type InboxMessage = import('@/lib/api').InboxMessage
type SendInboxMessageBody = import('@/lib/api').SendInboxMessageBody
type AssignInboxConversationBody = import('@/lib/api').AssignInboxConversationBody
type UpdateInboxConversationBody = import('@/lib/api').UpdateInboxConversationBody
type InboxConversationNote = import('@/lib/api').InboxConversationNote
type CreateInboxConversationNoteBody = import('@/lib/api').CreateInboxConversationNoteBody
type InboxAiModePatch = import('@/lib/api').InboxAiModePatch
type ListNotificationsParams = import('@/lib/api').ListNotificationsParams
type Notification = import('@/lib/api').Notification
type MarkAllNotificationsReadResult = import('@/lib/api').MarkAllNotificationsReadResult
type WhatsappConfigSummary = import('@/lib/api').WhatsappConfigSummary
type TestWhatsappConfigBody = import('@/lib/api').TestWhatsappConfigBody
type TestWhatsappConfigResult = import('@/lib/api').TestWhatsappConfigResult
type WhatsappEmbeddedSignupSession = import('@/lib/api').WhatsappEmbeddedSignupSession
type CompleteWhatsappEmbeddedSignupBody = import('@/lib/api').CompleteWhatsappEmbeddedSignupBody
type ListWhatsappTemplatesParams = import('@/lib/api').ListWhatsappTemplatesParams
type WhatsappMessageTemplate = import('@/lib/api').WhatsappMessageTemplate
type CreateWhatsappTemplateBody = import('@/lib/api').CreateWhatsappTemplateBody
type SyncWhatsappTemplatesResult = import('@/lib/api').SyncWhatsappTemplatesResult
type IntegrationConnection = import('@/lib/api').IntegrationConnection
type UpsertIntegrationConnectionBody = import('@/lib/api').UpsertIntegrationConnectionBody
type IntegrationApiKey = import('@/lib/api').IntegrationApiKey
type CreateIntegrationApiKeyBody = import('@/lib/api').CreateIntegrationApiKeyBody
type ListKnowledgeDocumentsParams = import('@/lib/api').ListKnowledgeDocumentsParams
type KnowledgeDocument = import('@/lib/api').KnowledgeDocument
type CreateKnowledgeDocumentBody = import('@/lib/api').CreateKnowledgeDocumentBody
type CreateKnowledgeDocumentResult = import('@/lib/api').CreateKnowledgeDocumentResult
type ListConversationFlowsParams = import('@/lib/api').ListConversationFlowsParams
type ConversationFlow = import('@/lib/api').ConversationFlow
type CreateConversationFlowBody = import('@/lib/api').CreateConversationFlowBody
type UpdateConversationFlowBody = import('@/lib/api').UpdateConversationFlowBody
type ConversationFlowValidateResult = import('@/lib/api').ConversationFlowValidateResult
type ListPlatformTemplateCatalogParams = import('@/lib/api').ListPlatformTemplateCatalogParams
type PlatformTemplateCatalogItem = import('@/lib/api').PlatformTemplateCatalogItem
type MetaTemplateLibraryItem = import('@/lib/api').MetaTemplateLibraryItem
type MetaTemplateLibraryList = import('@/lib/api').MetaTemplateLibraryList
type CreatePlatformTemplateCatalogBody = import('@/lib/api').CreatePlatformTemplateCatalogBody
type ListPlatformFlowCatalogParams = import('@/lib/api').ListPlatformFlowCatalogParams
type PlatformFlowCatalogItem = import('@/lib/api').PlatformFlowCatalogItem
type CreatePlatformFlowCatalogBody = import('@/lib/api').CreatePlatformFlowCatalogBody
type ListMediaParams = import('@/lib/api').ListMediaParams
type MediaAsset = import('@/lib/api').MediaAsset
type MediaQuota = import('@/lib/api').MediaQuota
type InitiateMediaUploadBody = import('@/lib/api').InitiateMediaUploadBody
type InitiateMediaUploadResult = import('@/lib/api').InitiateMediaUploadResult
type BillingSubscription = import('@/lib/api').BillingSubscription
type TenantBillingPlan = import('@/lib/api').TenantBillingPlan
type BillingEntitlementsSnapshot = import('@/lib/api').BillingEntitlementsSnapshot
type BillingCheckoutBody = import('@/lib/api').BillingCheckoutBody
type BillingCheckoutResult = import('@/lib/api').BillingCheckoutResult
type BillingVerifyBody = import('@/lib/api').BillingVerifyBody
type BillingVerifyResult = import('@/lib/api').BillingVerifyResult
type ListCampaignsParams = import('@/lib/api').ListCampaignsParams
type Campaign = import('@/lib/api').Campaign
type CreateCampaignBody = import('@/lib/api').CreateCampaignBody
type UpdateCampaignBody = import('@/lib/api').UpdateCampaignBody
type ReplaceCampaignRecipientsBody = import('@/lib/api').ReplaceCampaignRecipientsBody
type CampaignPreview = import('@/lib/api').CampaignPreview
type OrganizationMember = import('@/lib/api').OrganizationMember
type TransferOwnershipBody = import('@/lib/api').TransferOwnershipBody
type ListAuditParams = import('@/lib/api').ListAuditParams
type AuditListPayload = import('@/lib/api').AuditListPayload
type TenantAnalyticsSummary = import('@/lib/api').TenantAnalyticsSummary
type ListOrganizationAdminUsersParams = import('@/lib/api').ListOrganizationAdminUsersParams
type OrganizationAdminUser = import('@/lib/api').OrganizationAdminUser
type UpdateOrganizationAdminUserBody = import('@/lib/api').UpdateOrganizationAdminUserBody
type CreateInvitationBody = import('@/lib/api').CreateInvitationBody
type CreatedInvitation = import('@/lib/api').CreatedInvitation
type OrganizationRole = import('@/lib/api').OrganizationRole
type CreateRoleBody = import('@/lib/api').CreateRoleBody
type RoleUpdatePreview = import('@/lib/api').RoleUpdatePreview
type UpdateRoleBody = import('@/lib/api').UpdateRoleBody
type ResetRoleBody = import('@/lib/api').ResetRoleBody
type DeleteRoleBody = import('@/lib/api').DeleteRoleBody
type SuperAdminOrganization = import('@/lib/api').SuperAdminOrganization
type UpdateSuperAdminOrganizationBody = import('@/lib/api').UpdateSuperAdminOrganizationBody
type ListSuperAdminSubscriptionsParams = import('@/lib/api').ListSuperAdminSubscriptionsParams
type SuperAdminSubscription = import('@/lib/api').SuperAdminSubscription
type SuperAdminSubscriptionListSummary = import('@/lib/api').SuperAdminSubscriptionListSummary
type CreateSuperAdminSubscriptionBody = import('@/lib/api').CreateSuperAdminSubscriptionBody
type UpdateSuperAdminSubscriptionBody = import('@/lib/api').UpdateSuperAdminSubscriptionBody
type ListSuperAdminPlansParams = import('@/lib/api').ListSuperAdminPlansParams
type SuperAdminPlan = import('@/lib/api').SuperAdminPlan
type SuperAdminPlanSummary = import('@/lib/api').SuperAdminPlanSummary
type CreateSuperAdminPlanBody = import('@/lib/api').CreateSuperAdminPlanBody
type UpdateSuperAdminPlanBody = import('@/lib/api').UpdateSuperAdminPlanBody
type ListSuperAdminInvoicesParams = import('@/lib/api').ListSuperAdminInvoicesParams
type SuperAdminInvoice = import('@/lib/api').SuperAdminInvoice
type SuperAdminInvoiceSummary = import('@/lib/api').SuperAdminInvoiceSummary
type SuperAdminInvoiceBillingProfile = import('@/lib/api').SuperAdminInvoiceBillingProfile
type CreateSuperAdminInvoiceBody = import('@/lib/api').CreateSuperAdminInvoiceBody
type MarkSuperAdminInvoicePaidBody = import('@/lib/api').MarkSuperAdminInvoicePaidBody
type PlatformAiConfig = import('@/lib/api').PlatformAiConfig
type UpdatePlatformAiConfigBody = import('@/lib/api').UpdatePlatformAiConfigBody
type PlatformSettings = import('@/lib/api').PlatformSettings
type UpdatePlatformSettingsBody = import('@/lib/api').UpdatePlatformSettingsBody
type PlatformAnalyticsSummary = import('@/lib/api').PlatformAnalyticsSummary
type ListSuperAdminPlatformUsersParams = import('@/lib/api').ListSuperAdminPlatformUsersParams
type SuperAdminPlatformUser = import('@/lib/api').SuperAdminPlatformUser
