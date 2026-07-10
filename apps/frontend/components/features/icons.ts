import { MessageCircle, Zap, type LucideIcon } from 'lucide-react'

export const featureIconMap: Record<string, LucideIcon> = {
  MessageCircle,
  Zap,
}

export function getFeatureIcon(icon: string): LucideIcon {
  return featureIconMap[icon] ?? MessageCircle
}
