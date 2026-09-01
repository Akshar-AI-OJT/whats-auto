import { Bot, Check, Megaphone, MessagesSquare } from 'lucide-react'
import {
  authBrandingConfig,
  type AuthBrandingChecklistItem,
  type AuthBrandingFloatingCard,
  type AuthBrandingVariant,
} from '@/components/auth/auth-branding.config'
import { AuthBrandingShell } from '@/components/auth/auth-branding-shell'
import { AppLogo } from '@/components/branding/AppLogo'
import {
  authFloatingCardClassName,
  authFloatingChipClassName,
} from '@/components/auth/auth-field-styles'
import { cn } from '@/lib/utils'

export type { AuthBrandingVariant }

const sceneFrameClassName =
  'relative mx-auto h-[250px] w-full max-w-[280px] sm:h-[270px] md:mx-0 md:max-w-none md:h-[285px]'

function ChecklistRows({
  items,
  listStyle,
}: {
  items: AuthBrandingChecklistItem[]
  listStyle: 'stepper' | 'all-done'
}) {
  if (listStyle === 'all-done') {
    return (
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-positive text-canvas">
              <Check className="size-3.5 stroke-[2.5]" aria-hidden />
            </span>
            <span className="text-xs font-medium text-ink">{item.label}</span>
            <span className="ml-auto text-[10px] font-semibold text-positive-deep">
              Done
            </span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item, index) => (
        <li key={item.label} className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
              item.done ? 'bg-positive text-canvas' : 'bg-[#F1F5F9] text-mute'
            )}
          >
            {item.done ? (
              <Check className="size-3.5 stroke-[2.5]" aria-hidden />
            ) : (
              index + 1
            )}
          </span>
          <span
            className={cn('text-xs font-medium', item.done ? 'text-ink' : 'text-body')}
          >
            {item.label}
          </span>
          {item.done ? (
            <span className="ml-auto text-[10px] font-semibold text-positive-deep">
              Done
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function FloatingCard({ card }: { card: AuthBrandingFloatingCard }) {
  switch (card.kind) {
    case 'inbox':
      return (
        <div className={cn(card.className, authFloatingCardClassName)}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm">
                <MessagesSquare className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{card.title}</p>
                <p className="text-xs text-mute">{card.subtitle}</p>
              </div>
            </div>
            <span className="rounded-full bg-primary-pale px-2 py-0.5 text-[10px] font-semibold text-brand">
              {card.badge}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex gap-2">
              <span className="mt-1 size-6 shrink-0 rounded-full bg-[#E2E8F0] ring-2 ring-canvas" />
              <div className="rounded-2xl rounded-tl-md bg-[#F1F5F9] px-3 py-2 text-xs leading-5 text-body">
                {card.inbound}
              </div>
            </div>
            <div className="flex justify-end">
              <div className="rounded-2xl rounded-tr-md bg-primary px-3 py-2 text-xs leading-5 font-medium text-on-primary shadow-sm">
                {card.outbound}
              </div>
            </div>
            <div className="flex items-center gap-1.5 self-end rounded-full border border-[#E2E8F0] bg-canvas px-2.5 py-1 text-[10px] font-semibold text-brand shadow-sm">
              <Bot className="size-3" aria-hidden />
              {card.suggestion}
            </div>
          </div>
        </div>
      )

    case 'broadcast':
      return (
        <div className={cn(card.className, authFloatingChipClassName)}>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-ink text-primary">
              <Megaphone className="size-3.5" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-semibold text-ink">{card.title}</p>
              <p className="text-[10px] text-mute">{card.subtitle}</p>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#F1F5F9]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-brand"
              style={{ width: `${card.progressPercent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] font-medium text-body">{card.progressLabel}</p>
        </div>
      )

    case 'stat': {
      const Icon = card.icon
      return (
        <div className={cn(card.className, authFloatingChipClassName)}>
          <span className="flex size-8 items-center justify-center rounded-lg bg-[#F1F5F9] text-brand">
            <Icon className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-[10px] font-medium text-mute">{card.label}</p>
            <p className="text-sm font-semibold text-ink">{card.value}</p>
          </div>
        </div>
      )
    }

    case 'checklist': {
      const Icon = card.icon
      return (
        <div className={cn(card.className, authFloatingCardClassName)}>
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm">
              <Icon className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{card.title}</p>
              <p className="text-xs text-mute">{card.subtitle}</p>
            </div>
          </div>
          <ChecklistRows items={card.items} listStyle={card.listStyle} />
        </div>
      )
    }

    case 'chip': {
      const Icon = card.icon
      return (
        <div className={cn(card.className, authFloatingChipClassName)}>
          <span
            className={cn(
              'flex shrink-0 items-center justify-center rounded-lg',
              card.iconWrapClassName
            )}
          >
            <Icon className={card.iconSizeClassName ?? 'size-3.5'} aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold text-ink">{card.title}</p>
            <p className="text-[10px] text-mute">{card.subtitle}</p>
          </div>
        </div>
      )
    }

    case 'simple': {
      const Icon = card.icon
      return (
        <div className={cn(card.className, authFloatingCardClassName)}>
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm">
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{card.title}</p>
              <p className="text-xs text-mute">{card.subtitle}</p>
            </div>
          </div>
        </div>
      )
    }

    case 'pill': {
      const Icon = card.icon
      return (
        <div className={card.className}>
          <Icon className="size-3 text-brand" aria-hidden />
          {card.label}
        </div>
      )
    }

    default:
      return null
  }
}

/** Shared auth left-panel branding — content comes from auth-branding.config. */
export function AuthBranding({ variant }: { variant: AuthBrandingVariant }) {
  const config = authBrandingConfig[variant]

  return (
    <AuthBrandingShell footer={config.footer}>
      <div className="flex flex-col gap-3">
        <AppLogo size="sm" />
        <h2 className={config.headingClassName}>{config.heading}</h2>
        <p className={config.subtitleClassName}>{config.subtitle}</p>
      </div>

      <div className={sceneFrameClassName}>
        {config.floatingCards.map((card, index) => (
          <FloatingCard key={`${card.kind}-${index}`} card={card} />
        ))}
      </div>
    </AuthBrandingShell>
  )
}
