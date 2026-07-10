import type { ComponentType } from 'react'

export interface Feature {
  slug: string
  title: string
  icon: string
  summary: string
  content: () => Promise<{ default: ComponentType }>
}
