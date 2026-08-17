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
  type LucideIcon,
} from 'lucide-react'
import { PERMISSIONS } from '@/lib/rbac'

export const DASHBOARD_NAV_KEYS = [
  'dashboard',
  'team',
  'contacts',
  'inbox',
  // 'messages', // hidden for now (no clear product flow/page)
  'campaigns',
  'templates',
  'knowledge',
  'notifications',
  'analytics',
  'billing',
  // 'auditLogs', // hidden for now (tenant audit page not wired)
  'settings',
] as const

export type DashboardNavKey = (typeof DASHBOARD_NAV_KEYS)[number]

export const DASHBOARD_NAV_ICONS: Record<DashboardNavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  team: UsersRound,
  contacts: Users,
  inbox: Inbox,
  // messages: MessageSquare,
  campaigns: Megaphone,
  templates: FileText,
  knowledge: BookOpen,
  notifications: Bell,
  analytics: BarChart3,
  billing: CreditCard,
  // auditLogs: ScrollText,
  settings: Settings,
}

/** Real routes only; placeholders stay without href. */
export const DASHBOARD_NAV_HREFS: Partial<Record<DashboardNavKey, string>> = {
  dashboard: '/dashboard',
  team: '/dashboard/team',
  contacts: '/dashboard/contacts',
  inbox: '/dashboard/inbox',
  campaigns: '/dashboard/campaigns',
  templates: '/dashboard/templates',
  knowledge: '/dashboard/knowledge',
  notifications: '/dashboard/notifications',
  billing: '/dashboard/billing',
  settings: '/dashboard/settings',
}

export type DashboardNavChild = {
  key:
    | 'teamMembers'
    | 'teamRoles'
    | 'templatesList'
    | 'templatesMedia'
    | 'contactsList'
    | 'customerGroups'
  href?: string
  /** Permission required to show this child. */
  permission: string
}

/** Nested items under Team Management, Contacts & Audience, and Templates. */
export const DASHBOARD_NAV_CHILDREN: Partial<
  Record<DashboardNavKey, DashboardNavChild[]>
> = {
  team: [
    { key: 'teamMembers', href: '/dashboard/team', permission: PERMISSIONS.TEAM_VIEW },
    {
      key: 'teamRoles',
      href: '/dashboard/team/roles',
      // List middleware uses team:view; catalog also has roles:view — child shown if either.
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
  templates: [
    {
      key: 'templatesList',
      href: '/dashboard/templates',
      permission: PERMISSIONS.TEMPLATES_VIEW,
    },
    {
      key: 'templatesMedia',
      href: '/dashboard/templates/media',
      permission: PERMISSIONS.MEDIA_VIEW,
    },
  ],
}

/**
 * Permission required to show a top-level nav item with a real route.
 * Placeholders (no href) are left ungated — see RBAC report.
 * Templates uses TEMPLATES_VIEW; sidebar also allows WHATSAPP_VIEW | MEDIA_VIEW.
 */
export const DASHBOARD_NAV_PERMISSION: Partial<Record<DashboardNavKey, string>> = {
  contacts: PERMISSIONS.CONTACTS_VIEW,
  inbox: PERMISSIONS.INBOX_VIEW,
  campaigns: PERMISSIONS.CAMPAIGNS_VIEW,
  templates: PERMISSIONS.TEMPLATES_VIEW,
  knowledge: PERMISSIONS.AI_KB_VIEW,
  billing: PERMISSIONS.BILLING_VIEW,
  settings: PERMISSIONS.ORG_VIEW,
}
