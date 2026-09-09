import Image from 'next/image'
import { Link } from '@/i18n/navigation'
import { WHATS_AUTO_ICON_SRC, WHATS_AUTO_LOGO_ALT, WHATS_AUTO_LOGO_SRC } from '@/lib/branding'
import { cn } from '@/lib/utils'

const SIZE_PX = {
  xs: 24,
  sm: 36,
  md: 44,
  lg: 52,
} as const

type AppLogoSize = keyof typeof SIZE_PX

type AppLogoProps = {
  /** Mark uses the same asset at compact sizes (sidebar, favicon contexts). */
  variant?: 'logo' | 'mark'
  size?: AppLogoSize
  href?: string
  className?: string
  imageClassName?: string
  priority?: boolean
}

export function AppLogo({
  variant = 'logo',
  size = 'md',
  href,
  className,
  imageClassName,
  priority = false,
}: AppLogoProps) {
  const px = SIZE_PX[size]
  const src = variant === 'mark' ? WHATS_AUTO_ICON_SRC : WHATS_AUTO_LOGO_SRC

  const image = (
    <Image
      src={src}
      alt={WHATS_AUTO_LOGO_ALT}
      width={px}
      height={px}
      priority={priority}
      unoptimized
      className={cn('size-auto shrink-0 object-contain', imageClassName)}
      style={{ width: px, height: px }}
    />
  )

  const wrapperClassName = cn(
    'inline-flex shrink-0 items-center justify-center rounded-xl',
    'transition-opacity duration-200 hover:opacity-90',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
    className
  )

  if (href) {
    return (
      <Link href={href} className={wrapperClassName} aria-label={WHATS_AUTO_LOGO_ALT}>
        {image}
      </Link>
    )
  }

  return <span className={wrapperClassName}>{image}</span>
}
