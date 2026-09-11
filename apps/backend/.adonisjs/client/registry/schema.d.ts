/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'auth.sign_in_email': {
    methods: ["POST"]
    pattern: '/api/auth/sign-in/email'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth_controller').default['signInEmail']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth_controller').default['signInEmail']>>>
    }
  }
  'auth.sign_out': {
    methods: ["POST"]
    pattern: '/api/auth/sign-out'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth_controller').default['signOut']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth_controller').default['signOut']>>>
    }
  }
  'auth.get_session': {
    methods: ["GET","HEAD"]
    pattern: '/api/auth/get-session'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth_controller').default['getSession']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth_controller').default['getSession']>>>
    }
  }
  'auth.token': {
    methods: ["GET","HEAD"]
    pattern: '/api/auth/token'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth_controller').default['token']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth_controller').default['token']>>>
    }
  }
  'auth.jwks': {
    methods: ["GET","HEAD"]
    pattern: '/api/auth/jwks'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth_controller').default['jwks']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth_controller').default['jwks']>>>
    }
  }
  'media_public.serve': {
    methods: ["GET","HEAD"]
    pattern: '/media/*'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { '*': ParamValue[] }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/media_public_controller').default['serve']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/media_public_controller').default['serve']>>>
    }
  }
  'whatsapp_webhook.verify': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/webhooks/whatsapp'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/whatsapp_webhook_controller').default['verify']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/whatsapp_webhook_controller').default['verify']>>>
    }
  }
  'whatsapp_webhook.receive': {
    methods: ["POST"]
    pattern: '/api/v1/webhooks/whatsapp'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/whatsapp_webhook_controller').default['receive']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/whatsapp_webhook_controller').default['receive']>>>
    }
  }
  'billing_razorpay_webhook.receive': {
    methods: ["POST"]
    pattern: '/api/v1/webhooks/billing/razorpay'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/billing_razorpay_webhook_controller').default['receive']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/billing_razorpay_webhook_controller').default['receive']>>>
    }
  }
  'demo_bookings.availability': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/demo/availability'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/demo_booking').demoAvailabilityQueryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/demo_bookings_controller').default['availability']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/demo_bookings_controller').default['availability']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'demo_bookings.store': {
    methods: ["POST"]
    pattern: '/api/v1/demo/bookings'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/demo_booking').createDemoBookingValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/demo_booking').createDemoBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/demo_bookings_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/demo_bookings_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'external_events.store': {
    methods: ["POST"]
    pattern: '/api/v1/integrations/events'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/integration_event').genericIntegrationEventValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/integration_event').genericIntegrationEventValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/external_events_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/external_events_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'shopenup_integrations.store': {
    methods: ["POST"]
    pattern: '/api/v1/integrations/shopenup/events'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/integration_event').shopenupIntegrationEventValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/integration_event').shopenupIntegrationEventValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shopenup_integrations_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shopenup_integrations_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'whatsapp_embedded_signup.session': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/whatsapp/embedded-signup/session'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/whatsapp_embedded_signup_controller').default['session']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/whatsapp_embedded_signup_controller').default['session']>>>
    }
  }
  'whatsapp_embedded_signup.complete': {
    methods: ["POST"]
    pattern: '/api/v1/whatsapp/embedded-signup/complete'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/whatsapp_embedded_signup').completeEmbeddedSignupValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/whatsapp_embedded_signup').completeEmbeddedSignupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/whatsapp_embedded_signup_controller').default['complete']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/whatsapp_embedded_signup_controller').default['complete']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'whatsapp_configs.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/whatsapp/configs'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/whatsapp_configs_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/whatsapp_configs_controller').default['index']>>>
    }
  }
  'whatsapp_configs.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/whatsapp/configs/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/whatsapp_configs_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/whatsapp_configs_controller').default['destroy']>>>
    }
  }
  'whatsapp_configs.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/whatsapp/configs/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/whatsapp_configs_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/whatsapp_configs_controller').default['show']>>>
    }
  }
  'whatsapp_configs.test': {
    methods: ["POST"]
    pattern: '/api/v1/whatsapp/configs/:id/test'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/whatsapp_embedded_signup').testWhatsappConfigValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/whatsapp_embedded_signup').testWhatsappConfigValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/whatsapp_configs_controller').default['test']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/whatsapp_configs_controller').default['test']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'message_templates.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/whatsapp/templates'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/message_template').listMessageTemplatesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/message_templates_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/message_templates_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'message_templates.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/whatsapp/templates/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/message_template').templateIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/message_templates_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/message_templates_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'message_templates.store': {
    methods: ["POST"]
    pattern: '/api/v1/whatsapp/templates'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/message_template').createMessageTemplateValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/message_template').createMessageTemplateValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/message_templates_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/message_templates_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'message_templates.sync': {
    methods: ["POST"]
    pattern: '/api/v1/whatsapp/templates/sync'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/message_templates_controller').default['sync']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/message_templates_controller').default['sync']>>>
    }
  }
  'message_templates.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/whatsapp/templates/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/message_template').templateIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/message_template').templateIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/message_templates_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/message_templates_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'pre_signup': {
    methods: ["POST"]
    pattern: '/api/v1/auth/pre-signup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth').preSignupValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth').preSignupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/pre_signup_controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/pre_signup_controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'pre_signup.resend': {
    methods: ["POST"]
    pattern: '/api/v1/auth/pre-signup/resend'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth').resendSignupOtpValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth').resendSignupOtpValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/pre_signup_controller').default['resend']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/pre_signup_controller').default['resend']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'verify_signup': {
    methods: ["POST"]
    pattern: '/api/v1/auth/verify-signup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth').verifySignupValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth').verifySignupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/verify_signup_controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/verify_signup_controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'profile.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/account/profile'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['show']>>>
    }
  }
  'super_admin_organizations.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/organizations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/organization_crud').listSuperAdminOrganizationsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_organizations_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_organizations_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_organizations.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/organizations/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/organization_crud').organizationIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_organizations_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_organizations_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_organizations.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/super-admin/organizations/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization_crud').updateOrganizationValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization_crud').updateOrganizationValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_organizations_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_organizations_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_organizations.suspend': {
    methods: ["POST"]
    pattern: '/api/v1/super-admin/organizations/:id/suspend'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization_crud').organizationIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization_crud').organizationIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_organizations_controller').default['suspend']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_organizations_controller').default['suspend']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_organizations.activate': {
    methods: ["POST"]
    pattern: '/api/v1/super-admin/organizations/:id/activate'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization_crud').organizationIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization_crud').organizationIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_organizations_controller').default['activate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_organizations_controller').default['activate']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_organizations.soft_delete': {
    methods: ["DELETE"]
    pattern: '/api/v1/super-admin/organizations/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization_crud').organizationIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization_crud').organizationIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_organizations_controller').default['softDelete']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_organizations_controller').default['softDelete']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_subscriptions.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/subscriptions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/subscription_crud').listSuperAdminSubscriptionsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_subscriptions_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_subscriptions_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_subscriptions.store': {
    methods: ["POST"]
    pattern: '/api/v1/super-admin/subscriptions'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/subscription_crud').createSuperAdminSubscriptionValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/subscription_crud').createSuperAdminSubscriptionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_subscriptions_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_subscriptions_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_subscriptions.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/subscriptions/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/subscription_crud').subscriptionIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_subscriptions_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_subscriptions_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_subscriptions.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/super-admin/subscriptions/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/subscription_crud').subscriptionIdParamValidator)>|InferInput<(typeof import('#validators/subscription_crud').updateSuperAdminSubscriptionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/subscription_crud').subscriptionIdParamValidator)>|InferInput<(typeof import('#validators/subscription_crud').updateSuperAdminSubscriptionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_subscriptions_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_subscriptions_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_subscriptions.soft_delete': {
    methods: ["DELETE"]
    pattern: '/api/v1/super-admin/subscriptions/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/subscription_crud').subscriptionIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/subscription_crud').subscriptionIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_subscriptions_controller').default['softDelete']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_subscriptions_controller').default['softDelete']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_plans.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/plans'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/plan_crud').listSuperAdminPlansValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_plans_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_plans_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_plans.store': {
    methods: ["POST"]
    pattern: '/api/v1/super-admin/plans'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/plan_crud').createSuperAdminPlanValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/plan_crud').createSuperAdminPlanValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_plans_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_plans_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_plans.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/plans/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/plan_crud').planIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_plans_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_plans_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_plans.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/super-admin/plans/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/plan_crud').planIdParamValidator)>|InferInput<(typeof import('#validators/plan_crud').updateSuperAdminPlanValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/plan_crud').planIdParamValidator)>|InferInput<(typeof import('#validators/plan_crud').updateSuperAdminPlanValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_plans_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_plans_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_plans.soft_delete': {
    methods: ["DELETE"]
    pattern: '/api/v1/super-admin/plans/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/plan_crud').planIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/plan_crud').planIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_plans_controller').default['softDelete']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_plans_controller').default['softDelete']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_invoices.summary': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/invoices/summary'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/invoice_crud').invoiceSummaryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['summary']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['summary']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_invoices.billing_profile': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/invoices/billing-profile'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['billingProfile']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['billingProfile']>>>
    }
  }
  'super_admin_invoices.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/invoices'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/invoice_crud').listSuperAdminInvoicesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_invoices.store': {
    methods: ["POST"]
    pattern: '/api/v1/super-admin/invoices'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/invoice_crud').createSuperAdminInvoiceValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/invoice_crud').createSuperAdminInvoiceValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_invoices.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/invoices/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/invoice_crud').invoiceIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_invoices.mark_paid': {
    methods: ["POST"]
    pattern: '/api/v1/super-admin/invoices/:id/mark-paid'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/invoice_crud').invoiceIdParamValidator)>|InferInput<(typeof import('#validators/invoice_crud').markSuperAdminInvoicePaidValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/invoice_crud').invoiceIdParamValidator)>|InferInput<(typeof import('#validators/invoice_crud').markSuperAdminInvoicePaidValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['markPaid']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['markPaid']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_invoices.regenerate': {
    methods: ["POST"]
    pattern: '/api/v1/super-admin/invoices/:id/regenerate'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/invoice_crud').invoiceIdParamValidator)>|InferInput<(typeof import('#validators/invoice_crud').regenerateSuperAdminInvoiceValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/invoice_crud').invoiceIdParamValidator)>|InferInput<(typeof import('#validators/invoice_crud').regenerateSuperAdminInvoiceValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['regenerate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['regenerate']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_invoices.send': {
    methods: ["POST"]
    pattern: '/api/v1/super-admin/invoices/:id/send'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/invoice_crud').invoiceIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/invoice_crud').invoiceIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['send']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['send']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_invoices.download': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/invoices/:id/download'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/invoice_crud').invoiceIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['download']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_invoices_controller').default['download']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_platform_settings.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/platform-settings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_platform_settings_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_platform_settings_controller').default['show']>>>
    }
  }
  'super_admin_platform_settings.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/super-admin/platform-settings'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/platform_settings').updatePlatformSettingsValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/platform_settings').updatePlatformSettingsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_platform_settings_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_platform_settings_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_ai_config.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/ai-config'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_ai_config_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_ai_config_controller').default['show']>>>
    }
  }
  'super_admin_ai_config.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/super-admin/ai-config'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/platform_ai_config').updatePlatformAiConfigValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/platform_ai_config').updatePlatformAiConfigValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_ai_config_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_ai_config_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_audit.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/audit-logs'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/organization').listPlatformAuditValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_audit_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_audit_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_analytics.summary': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/analytics/summary'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_analytics_controller').default['summary']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_analytics_controller').default['summary']>>>
    }
  }
  'super_admin_platform_users.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/platform-users'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/super_admin_platform_users').listSuperAdminPlatformUsersValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_platform_users_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_platform_users_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'super_admin_search.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/super-admin/search'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/global_search').globalSearchQueryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/super_admin_search_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/super_admin_search_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'organization_admin_users.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/organization-admin/users'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/organization_admin_users').listOrganizationAdminUsersValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organization_admin_users_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organization_admin_users_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'organization_admin_users.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/organization-admin/users/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/organization_admin_users').organizationAdminUserIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organization_admin_users_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organization_admin_users_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'organization_admin_users.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/organization-admin/users/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization_admin_users').organizationAdminUserIdParamValidator)>|InferInput<(typeof import('#validators/organization_admin_users').updateOrganizationAdminUserValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization_admin_users').organizationAdminUserIdParamValidator)>|InferInput<(typeof import('#validators/organization_admin_users').updateOrganizationAdminUserValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organization_admin_users_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organization_admin_users_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'organization_admin_users.soft_delete': {
    methods: ["DELETE"]
    pattern: '/api/v1/organization-admin/users/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization_admin_users').organizationAdminUserIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization_admin_users').organizationAdminUserIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organization_admin_users_controller').default['softDelete']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organization_admin_users_controller').default['softDelete']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'organizations.store': {
    methods: ["POST"]
    pattern: '/api/v1/organizations'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization_crud').createOrganizationValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/organization_crud').createOrganizationValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'organizations.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/organizations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations_controller').default['index']>>>
    }
  }
  'organizations.set_active': {
    methods: ["POST"]
    pattern: '/api/v1/organizations/:id/set-active'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations_controller').default['setActive']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations_controller').default['setActive']>>>
    }
  }
  'organizations.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/organizations/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization_crud').updateOrganizationValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization_crud').updateOrganizationValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'organizations.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/organizations/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organizations_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organizations_controller').default['destroy']>>>
    }
  }
  'invitations.store': {
    methods: ["POST"]
    pattern: '/api/v1/organizations/:id/invitations'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/invitation').createInvitationValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/invitation').createInvitationValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/invitations_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/invitations_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'organization_smtp.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/organizations/:id/smtp'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organization_smtp_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organization_smtp_controller').default['show']>>>
    }
  }
  'organization_smtp.update': {
    methods: ["PUT"]
    pattern: '/api/v1/organizations/:id/smtp'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization_smtp').upsertOrganizationSmtpValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization_smtp').upsertOrganizationSmtpValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organization_smtp_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organization_smtp_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'organization_smtp.test': {
    methods: ["POST"]
    pattern: '/api/v1/organizations/:id/smtp/test'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization_smtp').testOrganizationSmtpValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization_smtp').testOrganizationSmtpValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organization_smtp_controller').default['test']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organization_smtp_controller').default['test']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'organization_smtp.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/organizations/:id/smtp'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/organization_smtp_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/organization_smtp_controller').default['destroy']>>>
    }
  }
  'access_context.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/access-context'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/access_context_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/access_context_controller').default['show']>>>
    }
  }
  'global_search.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/search'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/global_search').globalSearchQueryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/global_search_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/global_search_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'onboarding.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/onboarding/state'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/onboarding_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/onboarding_controller').default['show']>>>
    }
  }
  'roles.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/roles'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['index']>>>
    }
  }
  'roles.create': {
    methods: ["POST"]
    pattern: '/api/v1/roles'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization').createRoleValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/organization').createRoleValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['create']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'roles.preview': {
    methods: ["POST"]
    pattern: '/api/v1/roles/:roleKey/preview'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization').previewRoleUpdateValidator)>>
      paramsTuple: [ParamValue]
      params: { roleKey: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization').previewRoleUpdateValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['preview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['preview']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'roles.update': {
    methods: ["PUT"]
    pattern: '/api/v1/roles/:roleKey'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization').updateRoleValidator)>>
      paramsTuple: [ParamValue]
      params: { roleKey: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization').updateRoleValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'roles.reset': {
    methods: ["POST"]
    pattern: '/api/v1/roles/:roleKey/reset'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization').resetRoleValidator)>>
      paramsTuple: [ParamValue]
      params: { roleKey: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization').resetRoleValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['reset']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['reset']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'roles.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/roles/:roleKey'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization').deleteRoleValidator)>>
      paramsTuple: [ParamValue]
      params: { roleKey: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization').deleteRoleValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'members.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/members'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/members_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/members_controller').default['index']>>>
    }
  }
  'members.assign_role': {
    methods: ["PATCH"]
    pattern: '/api/v1/members/:memberId/role'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization').assignMemberRoleValidator)>>
      paramsTuple: [ParamValue]
      params: { memberId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/organization').assignMemberRoleValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/members_controller').default['assignRole']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/members_controller').default['assignRole']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'members.resend_invite': {
    methods: ["POST"]
    pattern: '/api/v1/members/:memberId/resend-invite'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { memberId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/members_controller').default['resendInvite']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/members_controller').default['resendInvite']>>>
    }
  }
  'members.remove': {
    methods: ["DELETE"]
    pattern: '/api/v1/members/:memberId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { memberId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/members_controller').default['remove']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/members_controller').default['remove']>>>
    }
  }
  'ownership.transfer': {
    methods: ["POST"]
    pattern: '/api/v1/ownership/transfer'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/organization').transferOwnershipValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/organization').transferOwnershipValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/ownership_controller').default['transfer']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/ownership_controller').default['transfer']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'audit.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/audit'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/organization').listTenantAuditValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/audit_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/audit_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'analytics.summary': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/analytics/summary'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/analytics_controller').default['summary']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/analytics_controller').default['summary']>>>
    }
  }
  'contacts.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/contacts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/contact').listContactsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'contacts.store': {
    methods: ["POST"]
    pattern: '/api/v1/contacts'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/contact').createContactValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/contact').createContactValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'contacts.import_csv': {
    methods: ["POST"]
    pattern: '/api/v1/contacts/import'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/contact').importContactsValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/contact').importContactsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts_controller').default['importCsv']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts_controller').default['importCsv']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'contacts.show_import': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/contacts/import/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/contact').contactIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts_controller').default['showImport']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts_controller').default['showImport']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'contacts.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/contacts/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/contact').contactIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'contacts.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/contacts/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/contact').contactIdParamValidator)>|InferInput<(typeof import('#validators/contact').updateContactValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/contact').contactIdParamValidator)>|InferInput<(typeof import('#validators/contact').updateContactValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'contacts.soft_delete': {
    methods: ["DELETE"]
    pattern: '/api/v1/contacts/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/contact').contactIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/contact').contactIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/contacts_controller').default['softDelete']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/contacts_controller').default['softDelete']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'tags.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/tags'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['index']>>>
    }
  }
  'tags.store': {
    methods: ["POST"]
    pattern: '/api/v1/tags'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/tag').createTagValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/tag').createTagValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'tags.contacts': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/tags/:id/contacts'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/tag').tagIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['contacts']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['contacts']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'tags.assign_contact': {
    methods: ["POST"]
    pattern: '/api/v1/tags/:id/contacts'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/tag').tagIdParamValidator)>|InferInput<(typeof import('#validators/tag').assignTagContactValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/tag').tagIdParamValidator)>|InferInput<(typeof import('#validators/tag').assignTagContactValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['assignContact']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['assignContact']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'tags.remove_contact': {
    methods: ["DELETE"]
    pattern: '/api/v1/tags/:id/contacts/:contactId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/tag').tagContactParamsValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; contactId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/tag').tagContactParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['removeContact']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['removeContact']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'tags.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/tags/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/tag').tagIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'tags.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/tags/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/tag').tagIdParamValidator)>|InferInput<(typeof import('#validators/tag').updateTagValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/tag').tagIdParamValidator)>|InferInput<(typeof import('#validators/tag').updateTagValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'tags.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/tags/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/tag').tagIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/tag').tagIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/tags_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'api_keys.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/api-keys'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['index']>>>
    }
  }
  'api_keys.store': {
    methods: ["POST"]
    pattern: '/api/v1/api-keys'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/api_key').createApiKeyValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/api_key').createApiKeyValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'api_keys.revoke': {
    methods: ["POST"]
    pattern: '/api/v1/api-keys/:id/revoke'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/api_key').apiKeyIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/api_key').apiKeyIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['revoke']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['revoke']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'integration_connections.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/integrations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/integration_connections_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/integration_connections_controller').default['index']>>>
    }
  }
  'integration_connections.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/integrations/:provider'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { provider: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/integration_connection').integrationProviderParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/integration_connections_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/integration_connections_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'integration_connections.upsert': {
    methods: ["PUT"]
    pattern: '/api/v1/integrations/:provider'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/integration_connection').integrationProviderParamValidator)>|InferInput<(typeof import('#validators/integration_connection').upsertIntegrationConnectionValidator)>>
      paramsTuple: [ParamValue]
      params: { provider: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/integration_connection').integrationProviderParamValidator)>|InferInput<(typeof import('#validators/integration_connection').upsertIntegrationConnectionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/integration_connections_controller').default['upsert']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/integration_connections_controller').default['upsert']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'integration_connections.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/integrations/:provider'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/integration_connection').integrationProviderParamValidator)>>
      paramsTuple: [ParamValue]
      params: { provider: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/integration_connection').integrationProviderParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/integration_connections_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/integration_connections_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'media_uploads.put_content': {
    methods: ["PUT"]
    pattern: '/api/v1/media/uploads/:id/content'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/media').mediaUploadIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/media').mediaUploadIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/media_uploads_controller').default['putContent']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/media_uploads_controller').default['putContent']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'media_assets.organization_logo': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/media/organization-logo'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/media_assets_controller').default['organizationLogo']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/media_assets_controller').default['organizationLogo']>>>
    }
  }
  'media_uploads.store': {
    methods: ["POST"]
    pattern: '/api/v1/media/uploads'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/media').initiateMediaUploadValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/media').initiateMediaUploadValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/media_uploads_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/media_uploads_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'media_uploads.complete': {
    methods: ["POST"]
    pattern: '/api/v1/media/uploads/:id/complete'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/media').mediaUploadIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/media').mediaUploadIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/media_uploads_controller').default['complete']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/media_uploads_controller').default['complete']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'media_assets.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/media'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/media').listMediaLibraryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/media_assets_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/media_assets_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'media_assets.quota': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/media/quota'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/media_assets_controller').default['quota']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/media_assets_controller').default['quota']>>>
    }
  }
  'media_assets.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/media/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/media').mediaAssetIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/media_assets_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/media_assets_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'media_assets.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/media/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/media').mediaAssetIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/media').mediaAssetIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/media_assets_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/media_assets_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'media_assets.restore': {
    methods: ["POST"]
    pattern: '/api/v1/media/:id/restore'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/media').mediaAssetIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/media').mediaAssetIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/media_assets_controller').default['restore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/media_assets_controller').default['restore']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'media_assets.purge': {
    methods: ["POST"]
    pattern: '/api/v1/media/:id/purge'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/media').mediaAssetIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/media').mediaAssetIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/media_assets_controller').default['purge']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/media_assets_controller').default['purge']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'knowledge_documents.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/ai/knowledge-documents'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/knowledge_document').listKnowledgeDocumentsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'knowledge_documents.store': {
    methods: ["POST"]
    pattern: '/api/v1/ai/knowledge-documents'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/knowledge_document').createKnowledgeDocumentValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/knowledge_document').createKnowledgeDocumentValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'knowledge_documents.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/ai/knowledge-documents/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/knowledge_document').knowledgeDocumentIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'knowledge_documents.complete_upload': {
    methods: ["POST"]
    pattern: '/api/v1/ai/knowledge-documents/:id/complete-upload'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/knowledge_document').knowledgeDocumentIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/knowledge_document').knowledgeDocumentIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['completeUpload']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['completeUpload']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'knowledge_documents.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/ai/knowledge-documents/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/knowledge_document').knowledgeDocumentIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/knowledge_document').knowledgeDocumentIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'knowledge_documents.restore': {
    methods: ["POST"]
    pattern: '/api/v1/ai/knowledge-documents/:id/restore'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/knowledge_document').knowledgeDocumentIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/knowledge_document').knowledgeDocumentIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['restore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['restore']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'knowledge_documents.purge': {
    methods: ["POST"]
    pattern: '/api/v1/ai/knowledge-documents/:id/purge'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/knowledge_document').knowledgeDocumentIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/knowledge_document').knowledgeDocumentIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['purge']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['purge']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'flows.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/flows'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/flow').listFlowsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'flows.store': {
    methods: ["POST"]
    pattern: '/api/v1/flows'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/flow').createFlowValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/flow').createFlowValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'flows.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/flows/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/flow').flowIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'flows.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/flows/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/flow').flowIdParamValidator)>|InferInput<(typeof import('#validators/flow').updateFlowValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/flow').flowIdParamValidator)>|InferInput<(typeof import('#validators/flow').updateFlowValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'flows.validate': {
    methods: ["POST"]
    pattern: '/api/v1/flows/:id/validate'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/flow').flowIdParamValidator)>|InferInput<(typeof import('#validators/flow').validateFlowValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/flow').flowIdParamValidator)>|InferInput<(typeof import('#validators/flow').validateFlowValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['validate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['validate']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'flows.publish': {
    methods: ["POST"]
    pattern: '/api/v1/flows/:id/publish'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/flow').flowIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/flow').flowIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['publish']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['publish']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'flows.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/flows/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/flow').flowIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/flow').flowIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'campaigns.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/campaigns'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/campaign').listCampaignsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'campaigns.preview': {
    methods: ["POST"]
    pattern: '/api/v1/campaigns/:id/preview'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>|InferInput<(typeof import('#validators/campaign').previewCampaignValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>|InferInput<(typeof import('#validators/campaign').previewCampaignValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['preview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['preview']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'campaigns.send': {
    methods: ["POST"]
    pattern: '/api/v1/campaigns/:id/send'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['send']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['send']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'campaigns.schedule': {
    methods: ["POST"]
    pattern: '/api/v1/campaigns/:id/schedule'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>|InferInput<(typeof import('#validators/campaign').scheduleCampaignValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>|InferInput<(typeof import('#validators/campaign').scheduleCampaignValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['schedule']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['schedule']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'campaigns.cancel': {
    methods: ["PATCH"]
    pattern: '/api/v1/campaigns/:id/cancel'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['cancel']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'campaigns.duplicate': {
    methods: ["POST"]
    pattern: '/api/v1/campaigns/:id/duplicate'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['duplicate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['duplicate']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'campaigns.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/campaigns/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'campaigns.store': {
    methods: ["POST"]
    pattern: '/api/v1/campaigns'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/campaign').createCampaignValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/campaign').createCampaignValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'campaigns.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/campaigns/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>|InferInput<(typeof import('#validators/campaign').updateCampaignValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>|InferInput<(typeof import('#validators/campaign').updateCampaignValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'campaigns.replace_recipients': {
    methods: ["PUT"]
    pattern: '/api/v1/campaigns/:id/recipients'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>|InferInput<(typeof import('#validators/campaign').replaceCampaignRecipientsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>|InferInput<(typeof import('#validators/campaign').replaceCampaignRecipientsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['replaceRecipients']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['replaceRecipients']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'campaigns.soft_delete': {
    methods: ["DELETE"]
    pattern: '/api/v1/campaigns/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/campaign').campaignIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['softDelete']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/campaigns_controller').default['softDelete']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'inbox_events.stream': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/inbox/events'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/inbox_events_controller').default['stream']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/inbox_events_controller').default['stream']>>>
    }
  }
  'conversations.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/inbox/conversations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/conversation').listConversationsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/conversations_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/conversations_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'conversations.store': {
    methods: ["POST"]
    pattern: '/api/v1/inbox/conversations'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/conversation').createConversationValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/conversation').createConversationValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/conversations_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/conversations_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'conversations.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/inbox/conversations/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/conversations_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/conversations_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'conversations.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/inbox/conversations/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>|InferInput<(typeof import('#validators/conversation').updateConversationValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>|InferInput<(typeof import('#validators/conversation').updateConversationValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/conversations_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/conversations_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'conversations.assign': {
    methods: ["POST"]
    pattern: '/api/v1/inbox/conversations/:id/assign'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>|InferInput<(typeof import('#validators/conversation').assignConversationValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>|InferInput<(typeof import('#validators/conversation').assignConversationValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/conversations_controller').default['assign']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/conversations_controller').default['assign']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'conversations.close': {
    methods: ["POST"]
    pattern: '/api/v1/inbox/conversations/:id/close'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/conversations_controller').default['close']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/conversations_controller').default['close']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'conversations.reopen': {
    methods: ["POST"]
    pattern: '/api/v1/inbox/conversations/:id/reopen'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/conversations_controller').default['reopen']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/conversations_controller').default['reopen']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'messages.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/inbox/conversations/:id/messages'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>|InferInput<(typeof import('#validators/message').listMessagesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/messages_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/messages_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'messages.store': {
    methods: ["POST"]
    pattern: '/api/v1/inbox/conversations/:id/messages'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>|InferInput<(typeof import('#validators/message').createMessageValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>|InferInput<(typeof import('#validators/message').createMessageValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/messages_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/messages_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'conversation_ai.takeover': {
    methods: ["POST"]
    pattern: '/api/v1/inbox/conversations/:id/ai/takeover'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/conversation_ai_controller').default['takeover']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/conversation_ai_controller').default['takeover']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'conversation_ai.resume': {
    methods: ["POST"]
    pattern: '/api/v1/inbox/conversations/:id/ai/resume'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/conversation_ai_controller').default['resume']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/conversation_ai_controller').default['resume']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'conversation_notes.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/inbox/conversations/:id/notes'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/conversation_notes_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/conversation_notes_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'conversation_notes.store': {
    methods: ["POST"]
    pattern: '/api/v1/inbox/conversations/:id/notes'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>|InferInput<(typeof import('#validators/conversation_note').createConversationNoteValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/conversation').conversationIdParamValidator)>|InferInput<(typeof import('#validators/conversation_note').createConversationNoteValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/conversation_notes_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/conversation_notes_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'billing.list_plans': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/billing/plans'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/billing_controller').default['listPlans']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/billing_controller').default['listPlans']>>>
    }
  }
  'billing.show_subscription': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/billing/subscription'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/billing_controller').default['showSubscription']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/billing_controller').default['showSubscription']>>>
    }
  }
  'billing.show_entitlements': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/billing/entitlements'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/billing_controller').default['showEntitlements']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/billing_controller').default['showEntitlements']>>>
    }
  }
  'billing.checkout': {
    methods: ["POST"]
    pattern: '/api/v1/billing/checkout'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/billing_checkout').billingCheckoutValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/billing_checkout').billingCheckoutValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/billing_controller').default['checkout']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/billing_controller').default['checkout']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'billing.verify': {
    methods: ["POST"]
    pattern: '/api/v1/billing/verify'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/billing_verify').billingVerifyValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/billing_verify').billingVerifyValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/billing_controller').default['verify']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/billing_controller').default['verify']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'notifications.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/notifications'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/notification').listNotificationsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/notifications_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/notifications_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'notifications.mark_all_as_read': {
    methods: ["PATCH"]
    pattern: '/api/v1/notifications/read-all'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/notifications_controller').default['markAllAsRead']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/notifications_controller').default['markAllAsRead']>>>
    }
  }
  'notifications.mark_as_read': {
    methods: ["PATCH"]
    pattern: '/api/v1/notifications/:id/read'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/notification').notificationIdParamValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/notification').notificationIdParamValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/notifications_controller').default['markAsRead']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/notifications_controller').default['markAsRead']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
}
