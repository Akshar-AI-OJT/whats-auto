import type { Metadata } from 'next'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { WHATS_AUTO_ICON_SRC } from '@/lib/branding'
import { ConditionalChrome } from '@/components/layout/ConditionalChrome'
import { Footer } from '@/components/layout/Footer'
import { Navbar } from '@/components/layout/Navbar'
import { AppProviders } from '@/components/providers/AppProviders'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { ThemeSurface } from '@/components/theme/ThemeSurface'
import { routing } from '@/i18n/routing'

export const metadata: Metadata = {
  title: 'Whats-Auto',
  description: 'Automate WhatsApp for sales, support, and marketing',
  icons: {
    icon: [{ url: WHATS_AUTO_ICON_SRC, type: 'image/png' }],
    apple: [{ url: WHATS_AUTO_ICON_SRC, type: 'image/png' }],
  },
}

export const dynamicParams = true

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <ThemeProvider>
      <NextIntlClientProvider messages={messages}>
        <AppProviders>
          <ThemeSurface>
            <ConditionalChrome>
              <Navbar />
            </ConditionalChrome>
            {children}
            <ConditionalChrome>
              <Footer />
            </ConditionalChrome>
          </ThemeSurface>
        </AppProviders>
      </NextIntlClientProvider>
    </ThemeProvider>
  )
}