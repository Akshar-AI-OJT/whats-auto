import {
  LayoutDashboard,
  Users,
  Inbox,
  MessageSquare,
  Megaphone,
  FileText,
  Bell,
  BarChart3,
  CreditCard,
  ScrollText,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export const DASHBOARD_NAV_KEYS = [
  'dashboard',
  'contacts',
  'inbox',
  'messages',
  'campaigns',
  'templates',
  'notifications',
  'analytics',
  'billing',
  'auditLogs',
  'settings',
] as const

export type DashboardNavKey = (typeof DASHBOARD_NAV_KEYS)[number]

export const DASHBOARD_NAV_ICONS: Record<DashboardNavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  contacts: Users,
  inbox: Inbox,
  messages: MessageSquare,
  campaigns: Megaphone,
  templates: FileText,
  notifications: Bell,
  analytics: BarChart3,
  billing: CreditCard,
  auditLogs: ScrollText,
  settings: Settings,
}

/** Only Dashboard is a real route for now; others are layout placeholders. */
export const DASHBOARD_NAV_HREFS: Partial<Record<DashboardNavKey, string>> = {
  dashboard: '/dashboard',
}
