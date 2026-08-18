import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { LoginForm } from '@/components/auth/login-form'
import { AuthLayout } from '@/components/auth/auth-layout'
import { AuthBranding } from '@/components/auth/auth-branding'

export const dynamic = 'force-dynamic'

function LoginFallback() {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm leading-5 text-mute">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>Loading…</span>
    </div>
  )
}

export default function LoginPage() {
  return (
    <AuthLayout branding={<AuthBranding variant="login" />}>
      <Suspense fallback={<LoginFallback />}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  )
}
