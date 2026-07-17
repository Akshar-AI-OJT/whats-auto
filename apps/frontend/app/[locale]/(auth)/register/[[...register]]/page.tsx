import { SignupForm } from '@/components/auth/signup-form'
import { AuthShell } from '@/components/auth/auth-shell'

export default function SignupPage() {
  return (
    <AuthShell
      panelTitle="Start automating WhatsApp today"
      panelSubtitle="Create your account free. Connect your number when you are ready."
    >
      <SignupForm />
    </AuthShell>
  )
}
