import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { AuthContinue } from '@/components/auth/auth-continue'
import { AuthLayout } from '@/components/auth/auth-layout'
import { AuthBranding } from '@/components/auth/auth-branding'

export const dynamic = 'force-dynamic'

function ContinueFallback() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm leading-5 text-mute">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>Continuing…</span>
    </div>
  )
}

export default function AuthContinuePage() {
  return (
    <AuthLayout branding={<AuthBranding variant="login" />}>
      <Suspense fallback={<ContinueFallback />}>
        <AuthContinue />
      </Suspense>
    </AuthLayout>
  )
}
