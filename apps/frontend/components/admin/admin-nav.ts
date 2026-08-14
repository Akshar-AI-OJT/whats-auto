import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Users,
  BarChart3,
  ScrollText,
  Bot,
  Settings,
  Layers,
  FileText,
  type LucideIcon,
} from 'lucide-react'

export const ADMIN_NAV_SECTION_IDS = [
  'overview',
  'management',
  'subscriptionBilling',
  'platform',
] as const

export type AdminNavSectionId = (typeof ADMIN_NAV_SECTION_IDS)[number]

export const ADMIN_NAV_KEYS = [
  'dashboard',
  'organizations',
  'plans',
  'subscriptions',
  'invoices',
  'platformUsers',
  'analytics',
  'auditLogs',
  'aiSettings',
  'settings',
] as const

export type AdminNavKey = (typeof ADMIN_NAV_KEYS)[number]

export type AdminNavSection = {
  id: AdminNavSectionId
  items: readonly AdminNavKey[]
}

/**
 * Sidebar structure: section heading → items.
 */
export const ADMIN_NAV_SECTIONS: readonly AdminNavSection[] = [
  { id: 'overview', items: ['dashboard'] },
  { id: 'management', items: ['organizations'] },
  { id: 'subscriptionBilling', items: ['plans', 'subscriptions', 'invoices'] },
  {
    id: 'platform',
    items: ['platformUsers', 'analytics', 'auditLogs', 'settings'],
  },
]

export const ADMIN_NAV_ICONS: Record<AdminNavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  organizations: Building2,
  plans: Layers,
  subscriptions: CreditCard,
  invoices: FileText,
  platformUsers: Users,
  analytics: BarChart3,
  auditLogs: ScrollText,
  aiSettings: Bot,
  settings: Settings,
}

/** Real admin routes only. Keys without an href render as coming-soon placeholders. */
export const ADMIN_NAV_HREFS: Partial<Record<AdminNavKey, string>> = {
  dashboard: '/admin/dashboard',
  organizations: '/admin/organizations',
  plans: '/admin/plans',
  subscriptions: '/admin/subscriptions',
  invoices: '/admin/invoices',
  platformUsers: '/admin/platform-users',
  analytics: '/admin/analytics',
  auditLogs: '/admin/audit-logs',
  aiSettings: '/admin/ai-settings',
  settings: '/admin/settings',
}
