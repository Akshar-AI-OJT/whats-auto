import { InboxLayoutShell } from '@/components/dashboard/inbox/InboxLayoutShell'

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return <InboxLayoutShell>{children}</InboxLayoutShell>
}
