import type { ComponentType } from 'react'

export interface Integration {
  slug: string
  name: string
  logo: string
  tagline: string
  content: () => Promise<{ default: ComponentType }>
}
