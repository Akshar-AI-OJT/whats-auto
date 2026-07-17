import { Suspense } from 'react'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { AuthShell } from '@/components/auth/auth-shell'

function ResetPasswordFallback() {
  return <div className="text-center text-sm text-mute">Loading…</div>
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      panelTitle="Choose a new password"
      panelSubtitle="Pick something strong. You will be signed out of other sessions."
    >
      <Suspense fallback={<ResetPasswordFallback />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  )
}
