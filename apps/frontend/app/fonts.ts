import { Inter, Manrope } from 'next/font/google'

/** Display face — open-source stand-in for proprietary Wise Sans (weight 800/900). */
export const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['600', '700', '800'],
})

/**
 * Body + UI — single Inter load.
 * Turbopack rejects multiple next/font/google queries for the same family
 * ("queries have exactly one entry").
 */
export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

/** Legacy aliases — `--font-body` / `--font-heading` are CSS-aliased to `--font-sans`. */
export const interBody = inter
export const interHeading = inter
