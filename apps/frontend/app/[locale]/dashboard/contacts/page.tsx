import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { ContactsPage } from '@/components/dashboard/contacts/ContactsPage'

export default function ContactsRoutePage() {
  return (
    <DashboardShell>
      <ContactsPage />
    </DashboardShell>
  )
}
