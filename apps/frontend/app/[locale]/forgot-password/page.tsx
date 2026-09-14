import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
import { AuthLayout } from '@/components/auth/auth-layout'
import { AuthBranding } from '@/components/auth/auth-branding'

export default function ForgotPasswordPage() {
  return (
    <AuthLayout branding={<AuthBranding variant="forgot-password" />}>
      <ForgotPasswordForm />
    </AuthLayout>
  )
}
