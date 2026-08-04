import { DashboardShell } from '@/components/dashboard/DashboardShell'

/**
 * Persist shell + OrganizationsProvider across dashboard routes so navigation
 * does not remount providers and re-fetch access-context on every click.
 */
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <DashboardShell>{children}</DashboardShell>
}
