import { cn } from '@/lib/utils'
import { categoryTone, formatTemplateCategory } from './template-utils'

export function TemplateCategoryPill({
  category,
  className,
}: {
  category: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        categoryTone(category),
        className
      )}
    >
      {formatTemplateCategory(category)}
    </span>
  )
}
