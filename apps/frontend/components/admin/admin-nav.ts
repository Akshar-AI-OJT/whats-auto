import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Users,
  BarChart3,
  ScrollText,
  Bot,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export const ADMIN_NAV_KEYS = [
  'dashboard',
  'organizations',
  'subscriptions',
  'platformUsers',
  'analytics',
  'auditLogs',
  'aiSettings',
  'settings',
] as const

export type AdminNavKey = (typeof ADMIN_NAV_KEYS)[number]

export const ADMIN_NAV_ICONS: Record<AdminNavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  organizations: Building2,
  subscriptions: CreditCard,
  platformUsers: Users,
  analytics: BarChart3,
  auditLogs: ScrollText,
  aiSettings: Bot,
  settings: Settings,
}

/** Dashboard, Organizations, Subscriptions, and Platform Users are real routes. */
export const ADMIN_NAV_HREFS: Partial<Record<AdminNavKey, string>> = {
  dashboard: '/admin/dashboard',
  organizations: '/admin/organizations',
  subscriptions: '/admin/subscriptions',
  platformUsers: '/admin/platform-users',
  analytics: '/admin/analytics',
  auditLogs: '/admin/audit-logs',
  aiSettings: '/admin/ai-settings',
  settings: '/admin/settings',
}
