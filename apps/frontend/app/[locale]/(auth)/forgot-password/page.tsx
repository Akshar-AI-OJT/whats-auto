import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
import { AuthShell } from '@/components/auth/auth-shell'

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      panelTitle="Reset your password"
      panelSubtitle="We will email you a secure link that expires in one hour."
    >
      <ForgotPasswordForm />
    </AuthShell>
  )
}
