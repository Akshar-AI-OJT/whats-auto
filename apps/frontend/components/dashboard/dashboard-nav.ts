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
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

export const DASHBOARD_NAV_KEYS = [
  'dashboard',
  'team',
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
  team: UsersRound,
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

/** Real routes only; placeholders stay without href. */
export const DASHBOARD_NAV_HREFS: Partial<Record<DashboardNavKey, string>> = {
  dashboard: '/dashboard',
  team: '/dashboard/team',
  contacts: '/dashboard/contacts',
  settings: '/dashboard/settings',
}

export type DashboardNavChild = {
  key: 'teamMembers'
  href?: string
}

/** Nested items under Team Management. */
export const DASHBOARD_NAV_CHILDREN: Partial<
  Record<DashboardNavKey, DashboardNavChild[]>
> = {
  team: [{ key: 'teamMembers', href: '/dashboard/team' }],
}
