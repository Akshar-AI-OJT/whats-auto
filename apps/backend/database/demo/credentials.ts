/** Development-only shared password for all demo credential accounts. */
export const DEMO_PASSWORD = 'DemoPass!2026'

export const DEMO_EMAIL_DOMAIN = 'demo.whats-auto.test'

export const DEMO_USERS = {
  superadmin: `superadmin@${DEMO_EMAIL_DOMAIN}`,
  northstarOwner: `owner.northstar@${DEMO_EMAIL_DOMAIN}`,
  northstarAdmin: `admin.northstar@${DEMO_EMAIL_DOMAIN}`,
  northstarAgent: `agent.northstar@${DEMO_EMAIL_DOMAIN}`,
  northstarViewer: `viewer.northstar@${DEMO_EMAIL_DOMAIN}`,
  northstarSupport: `support.northstar@${DEMO_EMAIL_DOMAIN}`,
  harborOwner: `owner.harbor@${DEMO_EMAIL_DOMAIN}`,
  harborAdmin: `admin.harbor@${DEMO_EMAIL_DOMAIN}`,
  harborAgent: `agent.harbor@${DEMO_EMAIL_DOMAIN}`,
  harborViewer: `viewer.harbor@${DEMO_EMAIL_DOMAIN}`,
  northstarInvitee: `invitee.northstar@${DEMO_EMAIL_DOMAIN}`,
} as const

export type DemoUserKey = keyof typeof DEMO_USERS

export const DEMO_ORGS = {
  northstar: {
    name: 'Northstar Home Goods',
    slug: 'northstar-home-goods',
    email: `hello@northstar.${DEMO_EMAIL_DOMAIN}`,
    country: 'India',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    industry: 'Retail',
  },
  harbor: {
    name: 'Harbor Fitness Studio',
    slug: 'harbor-fitness-studio',
    email: `hello@harbor.${DEMO_EMAIL_DOMAIN}`,
    country: 'United States',
    timezone: 'America/New_York',
    currency: 'USD',
    industry: 'Fitness',
  },
} as const
