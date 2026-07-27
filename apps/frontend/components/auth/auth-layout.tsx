import { AuthSplitLayout } from '@/components/auth/auth-split-layout'

/**
 * Shared auth page shell for Login, Register, OTP, Forgot, and Reset.
 * Pass a page-specific branding panel; chrome comes from AuthSplitLayout.
 */
export function AuthLayout({
  branding,
  children,
  className,
}: {
  branding: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <AuthSplitLayout branding={branding} className={className}>
      {children}
    </AuthSplitLayout>
  )
}
