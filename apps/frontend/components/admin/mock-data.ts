export type AdminKpiTone = 'up' | 'down' | 'neutral'

export type AdminMockKpi = {
  value: number
  delta: string
  tone: AdminKpiTone
  prefix?: string
  suffix?: string
  decimals?: number
  format?: 'number' | 'plain'
}

export const MOCK_ADMIN_KPIS = {
  totalOrganizations: {
    value: 248,
    delta: '+12',
    tone: 'up',
  },
  activeOrganizations: {
    value: 186,
    delta: '+8',
    tone: 'up',
  },
  trialOrganizations: {
    value: 42,
    delta: '+5',
    tone: 'up',
  },
  suspendedOrganizations: {
    value: 20,
    delta: '-2',
    tone: 'down',
  },
  totalPlatformUsers: {
    value: 4820,
    delta: '+6.4%',
    tone: 'up',
  },
  monthlyRevenue: {
    value: 48200,
    delta: '+9.1%',
    tone: 'up',
    prefix: '$',
  },
  activeWhatsappNumbers: {
    value: 1124,
    delta: '+34',
    tone: 'up',
  },
  pendingSupportTickets: {
    value: 37,
    delta: '+4',
    tone: 'up',
  },
} as const satisfies Record<string, AdminMockKpi>

export type OrgGrowthPoint = {
  month: string
  organizations: number
}

/** Last 6 months of organization growth. */
export const MOCK_ORG_GROWTH: OrgGrowthPoint[] = [
  { month: 'Feb', organizations: 168 },
  { month: 'Mar', organizations: 184 },
  { month: 'Apr', organizations: 201 },
  { month: 'May', organizations: 218 },
  { month: 'Jun', organizations: 232 },
  { month: 'Jul', organizations: 248 },
]

export type SubscriptionSlice = {
  id: 'starter' | 'growth' | 'pro' | 'enterprise'
  count: number
  colorClass: string
  /** Solid fill used in SVG (matches design tokens). */
  fill: string
}

export const MOCK_SUBSCRIPTION_DISTRIBUTION: SubscriptionSlice[] = [
  { id: 'starter', count: 94, colorClass: 'bg-mute', fill: '#94a3b8' },
  { id: 'growth', count: 86, colorClass: 'bg-primary', fill: '#9fe870' },
  { id: 'pro', count: 48, colorClass: 'bg-accent-cyan', fill: '#38c8ff' },
  { id: 'enterprise', count: 20, colorClass: 'bg-positive-deep', fill: '#3d8b40' },
]

export type RevenuePoint = {
  month: string
  revenue: number
}

export const MOCK_REVENUE_TREND: RevenuePoint[] = [
  { month: 'Feb', revenue: 31200 },
  { month: 'Mar', revenue: 34800 },
  { month: 'Apr', revenue: 37600 },
  { month: 'May', revenue: 41200 },
  { month: 'Jun', revenue: 44100 },
  { month: 'Jul', revenue: 48200 },
]

export type ActiveOrganizationPoint = {
  month: string
  active: number
}

export const MOCK_ACTIVE_ORG_TREND: ActiveOrganizationPoint[] = [
  { month: 'Feb', active: 128 },
  { month: 'Mar', active: 136 },
  { month: 'Apr', active: 149 },
  { month: 'May', active: 161 },
  { month: 'Jun', active: 174 },
  { month: 'Jul', active: 186 },
]

export type MessageVolumePoint = {
  month: string
  messages: number
}

export const MOCK_MESSAGE_VOLUME_TREND: MessageVolumePoint[] = [
  { month: 'Feb', messages: 186000 },
  { month: 'Mar', messages: 214000 },
  { month: 'Apr', messages: 228000 },
  { month: 'May', messages: 249000 },
  { month: 'Jun', messages: 274000 },
  { month: 'Jul', messages: 301000 },
]

export type AdminActivityTone = 'green' | 'blue' | 'amber' | 'neutral'

export type AdminActivityKind =
  | 'organization'
  | 'subscription'
  | 'user'
  | 'support'
  | 'billing'

export type AdminMockActivity = {
  id: string
  titleKey: string
  detailKey: string
  timestamp: string
  kind: AdminActivityKind
  tone: AdminActivityTone
}

export const MOCK_ADMIN_ACTIVITY: AdminMockActivity[] = [
  {
    id: 'a1',
    titleKey: 'orgCreated',
    detailKey: 'orgCreatedDetail',
    timestamp: '2026-07-28T07:15:00.000Z',
    kind: 'organization',
    tone: 'green',
  },
  {
    id: 'a2',
    titleKey: 'planUpgraded',
    detailKey: 'planUpgradedDetail',
    timestamp: '2026-07-28T06:39:00.000Z',
    kind: 'subscription',
    tone: 'blue',
  },
  {
    id: 'a3',
    titleKey: 'ticketOpened',
    detailKey: 'ticketOpenedDetail',
    timestamp: '2026-07-28T05:52:00.000Z',
    kind: 'support',
    tone: 'amber',
  },
  {
    id: 'a4',
    titleKey: 'userInvited',
    detailKey: 'userInvitedDetail',
    timestamp: '2026-07-28T04:27:00.000Z',
    kind: 'user',
    tone: 'neutral',
  },
  {
    id: 'a5',
    titleKey: 'paymentReceived',
    detailKey: 'paymentReceivedDetail',
    timestamp: '2026-07-28T02:07:00.000Z',
    kind: 'billing',
    tone: 'green',
  },
]

export type OrganizationPlan = 'starter' | 'growth' | 'pro' | 'enterprise'
export type OrganizationStatus = 'active' | 'trial' | 'suspended'

export type MockOrganization = {
  id: string
  name: string
  slug: string
  ownerName: string
  ownerEmail: string
  plan: OrganizationPlan
  status: OrganizationStatus
  members: number
  createdAt: string
}

export const MOCK_ORGANIZATIONS: MockOrganization[] = [
  {
    id: 'org_1',
    name: 'Acme Workspace',
    slug: 'acme',
    ownerName: 'Priya Sharma',
    ownerEmail: 'priya@acme.io',
    plan: 'pro',
    status: 'active',
    members: 24,
    createdAt: '2025-11-12',
  },
  {
    id: 'org_2',
    name: 'Nova Retail',
    slug: 'nova-retail',
    ownerName: 'Rahul Mehta',
    ownerEmail: 'rahul@novaretail.com',
    plan: 'growth',
    status: 'active',
    members: 12,
    createdAt: '2026-02-03',
  },
  {
    id: 'org_3',
    name: 'Horizon Health',
    slug: 'horizon-health',
    ownerName: 'Ananya Iyer',
    ownerEmail: 'ananya@horizon.health',
    plan: 'enterprise',
    status: 'active',
    members: 86,
    createdAt: '2025-06-21',
  },
  {
    id: 'org_4',
    name: 'BrightPath Labs',
    slug: 'brightpath',
    ownerName: 'Omar Khan',
    ownerEmail: 'omar@brightpath.io',
    plan: 'starter',
    status: 'trial',
    members: 4,
    createdAt: '2026-07-08',
  },
  {
    id: 'org_5',
    name: 'Contoso Logistics',
    slug: 'contoso',
    ownerName: 'Sneha Patel',
    ownerEmail: 'sneha@contoso.co',
    plan: 'growth',
    status: 'suspended',
    members: 31,
    createdAt: '2025-09-14',
  },
  {
    id: 'org_6',
    name: 'Demo Store',
    slug: 'demo-store',
    ownerName: 'Alex Chen',
    ownerEmail: 'alex@demostore.app',
    plan: 'starter',
    status: 'trial',
    members: 3,
    createdAt: '2026-07-18',
  },
  {
    id: 'org_7',
    name: 'Summit Media',
    slug: 'summit-media',
    ownerName: 'Jordan Lee',
    ownerEmail: 'jordan@summit.media',
    plan: 'pro',
    status: 'active',
    members: 18,
    createdAt: '2026-01-09',
  },
  {
    id: 'org_8',
    name: 'GreenCart',
    slug: 'greencart',
    ownerName: 'Meera Joshi',
    ownerEmail: 'meera@greencart.in',
    plan: 'growth',
    status: 'active',
    members: 9,
    createdAt: '2026-03-27',
  },
  {
    id: 'org_9',
    name: 'Pulse Fitness',
    slug: 'pulse-fitness',
    ownerName: 'Diego Alvarez',
    ownerEmail: 'diego@pulse.fit',
    plan: 'starter',
    status: 'suspended',
    members: 7,
    createdAt: '2025-12-02',
  },
  {
    id: 'org_10',
    name: 'Northwind Traders',
    slug: 'northwind',
    ownerName: 'Emily Wright',
    ownerEmail: 'emily@northwind.com',
    plan: 'enterprise',
    status: 'active',
    members: 112,
    createdAt: '2025-04-16',
  },
]

export type OrganizationMemberRole = 'owner' | 'admin' | 'member'

export type MockOrganizationMember = {
  id: string
  name: string
  email: string
  role: OrganizationMemberRole
  /** Calendar date YYYY-MM-DD — displayed as absolute date (hydration-safe). */
  lastActiveOn: string
}

export type MockOrganizationSubscription = {
  plan: OrganizationPlan
  billingCycle: 'monthly' | 'annual'
  amount: number
  seats: number
  renewsOn: string
  paymentMethod: string
  invoiceEmail: string
}

export type MockOrganizationStats = {
  contacts: number
  conversations: number
  campaignsSent: number
  messagesSent: number
  whatsappNumbers: number
  templates: number
}

export type MockOrganizationActivity = {
  id: string
  title: string
  detail: string
  /** Fixed ISO timestamp for relative formatting after hydration. */
  timestamp: string
  tone: AdminActivityTone
  kind: AdminActivityKind
}

export type MockOrganizationDetail = MockOrganization & {
  industry: string
  website: string
  country: string
  timezone: string
  phone: string
  subscription: MockOrganizationSubscription
  stats: MockOrganizationStats
  memberList: MockOrganizationMember[]
  activity: MockOrganizationActivity[]
}

const PLAN_AMOUNTS: Record<OrganizationPlan, { monthly: number; annual: number }> = {
  starter: { monthly: 29, annual: 290 },
  growth: { monthly: 99, annual: 990 },
  pro: { monthly: 249, annual: 2490 },
  enterprise: { monthly: 799, annual: 7990 },
}

function buildOrgDetail(org: MockOrganization): MockOrganizationDetail {
  const amount =
    org.plan === 'enterprise' || org.plan === 'pro'
      ? PLAN_AMOUNTS[org.plan].annual
      : PLAN_AMOUNTS[org.plan].monthly
  const billingCycle: 'monthly' | 'annual' =
    org.plan === 'enterprise' || org.plan === 'pro' ? 'annual' : 'monthly'

  const baseMembers: MockOrganizationMember[] = [
    {
      id: `${org.id}_m1`,
      name: org.ownerName,
      email: org.ownerEmail,
      role: 'owner',
      lastActiveOn: '2026-07-27',
    },
    {
      id: `${org.id}_m2`,
      name: 'Sam Rivera',
      email: `sam@${org.slug.replace(/-/g, '')}.io`,
      role: 'admin',
      lastActiveOn: '2026-07-26',
    },
    {
      id: `${org.id}_m3`,
      name: 'Taylor Brooks',
      email: `taylor@${org.slug.replace(/-/g, '')}.io`,
      role: 'member',
      lastActiveOn: '2026-07-24',
    },
    {
      id: `${org.id}_m4`,
      name: 'Jamie Nguyen',
      email: `jamie@${org.slug.replace(/-/g, '')}.io`,
      role: 'member',
      lastActiveOn: '2026-07-22',
    },
  ]

  const memberList = baseMembers.slice(0, Math.min(4, Math.max(2, Math.ceil(org.members / 8))))

  return {
    ...org,
    industry:
      org.plan === 'enterprise'
        ? 'Healthcare & enterprise'
        : org.slug.includes('retail') || org.slug.includes('cart')
          ? 'Retail & ecommerce'
          : 'SaaS & services',
    website: `https://${org.slug}.example.com`,
    country: org.slug.includes('in') || org.name.includes('Green') ? 'India' : 'United States',
    timezone: 'Asia/Kolkata',
    phone: '+1 (555) 014-2890',
    subscription: {
      plan: org.plan,
      billingCycle,
      amount,
      seats: Math.max(org.members, billingCycle === 'annual' ? 25 : 5),
      renewsOn: '2026-08-12',
      paymentMethod: 'Visa •••• 4242',
      invoiceEmail: org.ownerEmail,
    },
    stats: {
      contacts: 1200 + org.members * 85,
      conversations: 80 + org.members * 6,
      campaignsSent: 8 + Math.floor(org.members / 3),
      messagesSent: 8400 + org.members * 320,
      whatsappNumbers: Math.max(1, Math.floor(org.members / 10)),
      templates: 6 + Math.floor(org.members / 4),
    },
    memberList,
    activity: [
      {
        id: `${org.id}_act1`,
        title: 'Campaign launched',
        detail: `${org.name} sent a broadcast to 2,400 contacts.`,
        timestamp: '2026-07-27T08:15:00.000Z',
        tone: 'green',
        kind: 'organization',
      },
      {
        id: `${org.id}_act2`,
        title: 'Seat added',
        detail: 'A new admin seat was assigned on the workspace.',
        timestamp: '2026-07-26T14:40:00.000Z',
        tone: 'blue',
        kind: 'user',
      },
      {
        id: `${org.id}_act3`,
        title: 'Invoice paid',
        detail: `Payment of $${amount.toLocaleString()} received for the ${org.plan} plan.`,
        timestamp: '2026-07-25T11:05:00.000Z',
        tone: 'green',
        kind: 'billing',
      },
      {
        id: `${org.id}_act4`,
        title: 'Support reply sent',
        detail: 'Platform support closed a billing clarification ticket.',
        timestamp: '2026-07-24T16:20:00.000Z',
        tone: 'amber',
        kind: 'support',
      },
    ],
  }
}

const MOCK_ORGANIZATION_DETAILS: Record<string, MockOrganizationDetail> =
  Object.fromEntries(
    MOCK_ORGANIZATIONS.map((org) => [org.id, buildOrgDetail(org)])
  )

export function getMockOrganization(id: string): MockOrganization | null {
  return MOCK_ORGANIZATIONS.find((org) => org.id === id) ?? null
}

export function getMockOrganizationDetail(id: string): MockOrganizationDetail | null {
  return MOCK_ORGANIZATION_DETAILS[id] ?? null
}

export type PlatformPlanId = 'starter' | 'growth' | 'scale' | 'enterprise'

export type MockPlatformPlan = {
  id: PlatformPlanId
  /** Monthly price in USD; null = custom / contact sales. */
  priceMonthly: number | null
  userLimit: number | null
  messageLimit: number | null
  workspaceLimit: number | null
  featureKeys: string[]
  highlighted?: boolean
  activeOrgs: number
}

export const MOCK_PLATFORM_PLANS: MockPlatformPlan[] = [
  {
    id: 'starter',
    priceMonthly: 29,
    userLimit: 3,
    messageLimit: 5_000,
    workspaceLimit: 1,
    featureKeys: [
      'inbox',
      'basicCampaigns',
      'templates',
      'emailSupport',
    ],
    activeOrgs: 94,
  },
  {
    id: 'growth',
    priceMonthly: 99,
    userLimit: 10,
    messageLimit: 25_000,
    workspaceLimit: 3,
    featureKeys: [
      'inbox',
      'campaigns',
      'templates',
      'automation',
      'analytics',
      'prioritySupport',
    ],
    highlighted: true,
    activeOrgs: 86,
  },
  {
    id: 'scale',
    priceMonthly: 249,
    userLimit: 40,
    messageLimit: 100_000,
    workspaceLimit: 10,
    featureKeys: [
      'inbox',
      'campaigns',
      'templates',
      'automation',
      'analytics',
      'webhooks',
      'roles',
      'prioritySupport',
    ],
    activeOrgs: 48,
  },
  {
    id: 'enterprise',
    priceMonthly: null,
    userLimit: null,
    messageLimit: null,
    workspaceLimit: null,
    featureKeys: [
      'inbox',
      'campaigns',
      'templates',
      'automation',
      'analytics',
      'webhooks',
      'roles',
      'sso',
      'dedicatedSupport',
      'sla',
    ],
    activeOrgs: 20,
  },
]

export type AuditLogStatus = 'success' | 'warning' | 'failed'

export type MockAuditLog = {
  id: string
  timestamp: string
  user: string
  action: string
  organization: string
  ipAddress: string
  status: AuditLogStatus
}

export const MOCK_AUDIT_LOGS: MockAuditLog[] = [
  {
    id: 'al_1',
    timestamp: '2026-07-28T07:42:00.000Z',
    user: 'Ritika Sharma',
    action: 'Changed platform billing alert threshold',
    organization: 'Acme Workspace',
    ipAddress: '122.162.14.8',
    status: 'success',
  },
  {
    id: 'al_2',
    timestamp: '2026-07-28T07:26:00.000Z',
    user: 'Arjun Nair',
    action: 'Suspended organization workspace',
    organization: 'Contoso Logistics',
    ipAddress: '49.43.21.60',
    status: 'warning',
  },
  {
    id: 'al_3',
    timestamp: '2026-07-28T06:58:00.000Z',
    user: 'Neha Verma',
    action: 'Reset API token for support diagnostics',
    organization: 'Nova Retail',
    ipAddress: '103.120.75.14',
    status: 'success',
  },
  {
    id: 'al_4',
    timestamp: '2026-07-28T06:21:00.000Z',
    user: 'Kunal Rao',
    action: 'Attempted plan change without required approval',
    organization: 'Horizon Health',
    ipAddress: '157.51.112.201',
    status: 'failed',
  },
  {
    id: 'al_5',
    timestamp: '2026-07-28T05:49:00.000Z',
    user: 'Maya Singh',
    action: 'Exported audit report CSV',
    organization: 'Platform (All Orgs)',
    ipAddress: '106.198.42.111',
    status: 'success',
  },
  {
    id: 'al_6',
    timestamp: '2026-07-28T05:16:00.000Z',
    user: 'Dev Patel',
    action: 'Updated role permissions matrix',
    organization: 'Northwind Traders',
    ipAddress: '14.139.210.19',
    status: 'warning',
  },
  {
    id: 'al_7',
    timestamp: '2026-07-28T04:38:00.000Z',
    user: 'Sara Khan',
    action: 'Forced sign-out for inactive admin session',
    organization: 'Summit Media',
    ipAddress: '45.113.231.77',
    status: 'success',
  },
  {
    id: 'al_8',
    timestamp: '2026-07-28T03:57:00.000Z',
    user: 'Ishan Mehta',
    action: 'Bulk invite sync failed due to CSV mismatch',
    organization: 'GreenCart',
    ipAddress: '59.90.188.24',
    status: 'failed',
  },
]

export type PlatformSettingState = 'enabled' | 'disabled' | 'scheduled'

export type MockPlatformSettingItem = {
  id: string
  key: string
  value: string
  state: PlatformSettingState
}

export type MockPlatformSettings = {
  branding: MockPlatformSettingItem[]
  authentication: MockPlatformSettingItem[]
  smtp: MockPlatformSettingItem[]
  oauth: MockPlatformSettingItem[]
  maintenanceMode: MockPlatformSettingItem[]
  configuration: MockPlatformSettingItem[]
}

export const MOCK_PLATFORM_SETTINGS: MockPlatformSettings = {
  branding: [
    {
      id: 'branding_1',
      key: 'platformName',
      value: 'Whats-Auto',
      state: 'enabled',
    },
    {
      id: 'branding_2',
      key: 'primaryDomain',
      value: 'app.whatsauto.com',
      state: 'enabled',
    },
    {
      id: 'branding_3',
      key: 'supportEmail',
      value: 'support@whatsauto.com',
      state: 'enabled',
    },
  ],
  authentication: [
    {
      id: 'auth_1',
      key: 'sessionTimeout',
      value: '12 hours',
      state: 'enabled',
    },
    {
      id: 'auth_2',
      key: 'mfaEnforcement',
      value: 'Super Admin + Platform Admin',
      state: 'enabled',
    },
    {
      id: 'auth_3',
      key: 'passwordPolicy',
      value: 'Min 12 chars, uppercase, number, symbol',
      state: 'enabled',
    },
  ],
  smtp: [
    {
      id: 'smtp_1',
      key: 'provider',
      value: 'SendGrid',
      state: 'enabled',
    },
    {
      id: 'smtp_2',
      key: 'fromAddress',
      value: 'no-reply@whatsauto.com',
      state: 'enabled',
    },
    {
      id: 'smtp_3',
      key: 'dailyLimit',
      value: '50,000 emails/day',
      state: 'enabled',
    },
  ],
  oauth: [
    {
      id: 'oauth_1',
      key: 'googleSignIn',
      value: 'Client configured',
      state: 'enabled',
    },
    {
      id: 'oauth_2',
      key: 'microsoftSignIn',
      value: 'Pending configuration',
      state: 'disabled',
    },
    {
      id: 'oauth_3',
      key: 'redirectUrl',
      value: 'https://app.whatsauto.com/auth/callback',
      state: 'enabled',
    },
  ],
  maintenanceMode: [
    {
      id: 'maintenance_1',
      key: 'currentState',
      value: 'Off',
      state: 'disabled',
    },
    {
      id: 'maintenance_2',
      key: 'allowlistedIps',
      value: '4 addresses',
      state: 'enabled',
    },
    {
      id: 'maintenance_3',
      key: 'nextWindow',
      value: 'Sun, 02:00 - 03:00 UTC',
      state: 'scheduled',
    },
  ],
  configuration: [
    {
      id: 'config_1',
      key: 'defaultTimezone',
      value: 'Asia/Kolkata',
      state: 'enabled',
    },
    {
      id: 'config_2',
      key: 'dataRetention',
      value: '180 days',
      state: 'enabled',
    },
    {
      id: 'config_3',
      key: 'apiRateLimit',
      value: '1,000 req/min/workspace',
      state: 'enabled',
    },
  ],
}

