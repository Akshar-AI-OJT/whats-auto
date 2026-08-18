import {
  LayoutDashboard,
  Users,
  Inbox,
  Megaphone,
  FileText,
  Bell,
  BarChart3,
  CreditCard,
  Settings,
  UsersRound,
  BookOpen,
  Image as ImageIcon,
  ScrollText,
  type LucideIcon,
} from 'lucide-react'
import { PERMISSIONS } from '@/lib/rbac'

export const DASHBOARD_NAV_SECTION_IDS = [
  'overview',
  'messaging',
  'campaignsContent',
  'automationAi',
  'insights',
  'teamAccess',
  'billing',
  'settings',
] as const

export type DashboardNavSectionId = (typeof DASHBOARD_NAV_SECTION_IDS)[number]

export const DASHBOARD_NAV_KEYS = [
  'dashboard',
  'inbox',
  'contacts',
  'campaigns',
  'templates',
  'media',
  'knowledge',
  'analytics',
  'team',
  'auditLogs',
  'billing',
  'notifications',
  'settings',
] as const

export type DashboardNavKey = (typeof DASHBOARD_NAV_KEYS)[number]

export type DashboardNavSection = {
  id: DashboardNavSectionId
  items: readonly DashboardNavKey[]
}

/**
 * Sidebar structure: uppercase section heading → existing modules.
 * Super Admin catalog items (plans, invoices, AI settings, etc.) stay in admin nav.
 */
export const DASHBOARD_NAV_SECTIONS: readonly DashboardNavSection[] = [
  { id: 'overview', items: ['dashboard'] },
  { id: 'messaging', items: ['inbox', 'contacts'] },
  { id: 'campaignsContent', items: ['campaigns', 'templates', 'media'] },
  { id: 'automationAi', items: ['knowledge'] },
  { id: 'insights', items: ['analytics'] },
  { id: 'teamAccess', items: ['team', 'auditLogs'] },
  { id: 'billing', items: ['billing'] },
  { id: 'settings', items: ['notifications', 'settings'] },
]

export const DASHBOARD_NAV_ICONS: Record<DashboardNavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  contacts: Users,
  campaigns: Megaphone,
  templates: FileText,
  media: ImageIcon,
  knowledge: BookOpen,
  analytics: BarChart3,
  team: UsersRound,
  auditLogs: ScrollText,
  billing: CreditCard,
  notifications: Bell,
  settings: Settings,
}

/** Real routes only; placeholders stay without href. */
export const DASHBOARD_NAV_HREFS: Partial<Record<DashboardNavKey, string>> = {
  dashboard: '/dashboard',
  inbox: '/dashboard/inbox',
  contacts: '/dashboard/contacts',
  campaigns: '/dashboard/campaigns',
  templates: '/dashboard/templates',
  media: '/dashboard/templates/media',
  knowledge: '/dashboard/knowledge',
  team: '/dashboard/team',
  auditLogs: '/dashboard/audit-logs',
  billing: '/dashboard/billing',
  notifications: '/dashboard/notifications',
  settings: '/dashboard/settings',
}

export type DashboardNavChild = {
  key: 'teamMembers' | 'teamRoles' | 'contactsList' | 'customerGroups'
  href?: string
  /** Permission required to show this child. */
  permission: string
}

/** Nested items under Team Management and Contacts & Audience. */
export const DASHBOARD_NAV_CHILDREN: Partial<
  Record<DashboardNavKey, DashboardNavChild[]>
> = {
  team: [
    { key: 'teamMembers', href: '/dashboard/team', permission: PERMISSIONS.TEAM_VIEW },
    {
      key: 'teamRoles',
      href: '/dashboard/team/roles',
      permission: PERMISSIONS.ROLES_VIEW,
    },
  ],
  contacts: [
    { key: 'contactsList', href: '/dashboard/contacts', permission: PERMISSIONS.CONTACTS_VIEW },
    {
      key: 'customerGroups',
      href: '/dashboard/customer-groups',
      permission: PERMISSIONS.CONTACTS_VIEW,
    },
  ],
}

/**
 * Permission required to show a top-level nav item with a real route.
 * Placeholders (no href) are left ungated — see RBAC report.
 * Templates also allows WHATSAPP_VIEW in the sidebar renderer.
 */
export const DASHBOARD_NAV_PERMISSION: Partial<Record<DashboardNavKey, string>> = {
  inbox: PERMISSIONS.INBOX_VIEW,
  contacts: PERMISSIONS.CONTACTS_VIEW,
  campaigns: PERMISSIONS.CAMPAIGNS_VIEW,
  templates: PERMISSIONS.TEMPLATES_VIEW,
  media: PERMISSIONS.MEDIA_VIEW,
  knowledge: PERMISSIONS.AI_KB_VIEW,
  auditLogs: PERMISSIONS.AUDIT_VIEW,
  billing: PERMISSIONS.BILLING_VIEW,
  settings: PERMISSIONS.ORG_VIEW,
}

export function isCustomerGroupsPath(pathname: string) {
  return (
    pathname === '/dashboard/customer-groups' || pathname.startsWith('/dashboard/customer-groups/')
  )
}

export function isTemplatesListPath(pathname: string) {
  if (pathname === '/dashboard/templates') return true
  if (!pathname.startsWith('/dashboard/templates/')) return false
  return !pathname.startsWith('/dashboard/templates/media')
}

export function isMediaLibraryPath(pathname: string) {
  return (
    pathname === '/dashboard/templates/media' || pathname.startsWith('/dashboard/templates/media/')
  )
}
