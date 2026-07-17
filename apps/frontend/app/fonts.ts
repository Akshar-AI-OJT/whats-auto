import { Inter, Manrope } from 'next/font/google'

/** Display face — open-source stand-in for proprietary Wise Sans (weight 800/900). */
export const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['600', '700', '800'],
})

/** Body + UI — Wise's actual second face (Inter with calt). */
export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

/** Alias kept for any legacy --font-body / --font-heading references. */
export const interBody = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

export const interHeading = Inter({
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
  weight: ['600', '700'],
})
