import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { AuthLayout } from '@/components/auth/auth-layout'
import { AuthBranding } from '@/components/auth/auth-branding'

function ResetPasswordFallback() {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm leading-5 text-mute">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>Loading…</span>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <AuthLayout branding={<AuthBranding variant="reset-password" />}>
      <Suspense fallback={<ResetPasswordFallback />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  )
}
