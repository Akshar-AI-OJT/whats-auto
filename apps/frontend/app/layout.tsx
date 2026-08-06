import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { cn } from '@/lib/utils'
import { suppressExtensionNoiseScript } from '@/components/dev/suppress-extension-noise-script'
import { themeInitScript } from '@/components/theme/theme-script'
import { manrope, inter, interBody, interHeading } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Whats-Auto',
  description: 'Automate WhatsApp for sales, support, and marketing',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(
        'antialiased',
        manrope.variable,
        inter.variable,
        interBody.variable,
        interHeading.variable,
        'font-sans'
      )}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: suppressExtensionNoiseScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-dvh flex-col overflow-x-clip bg-canvas-soft text-ink">
        {children}
      </body>
    </html>
  )
}
