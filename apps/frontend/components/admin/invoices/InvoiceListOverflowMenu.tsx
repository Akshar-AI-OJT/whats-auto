'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

const MENU_WIDTH = 208
const VIEWPORT_PAD = 8
const GAP = 4

type InvoiceListOverflowMenuProps = {
  open: boolean
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
}

function computePosition(anchor: HTMLElement, menuHeight: number) {
  const rect = anchor.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD
  const spaceAbove = rect.top - VIEWPORT_PAD
  const openAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow

  let top = openAbove ? rect.top - GAP - menuHeight : rect.bottom + GAP
  let left = rect.right - MENU_WIDTH

  top = Math.min(
    Math.max(VIEWPORT_PAD, top),
    Math.max(VIEWPORT_PAD, window.innerHeight - menuHeight - VIEWPORT_PAD)
  )
  left = Math.min(
    Math.max(VIEWPORT_PAD, left),
    Math.max(VIEWPORT_PAD, window.innerWidth - MENU_WIDTH - VIEWPORT_PAD)
  )

  return { top, left }
}

export function InvoiceListOverflowMenu({
  open,
  anchor,
  onClose,
  children,
}: InvoiceListOverflowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor) return
    const menuAnchor = anchor

    function update() {
      if (!menuRef.current) return
      const height = menuRef.current.offsetHeight || 220
      setCoords(computePosition(menuAnchor, height))
    }

    const frame = window.requestAnimationFrame(update)

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || menuAnchor.contains(target)) return
      onClose()
    }

    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, anchor, onClose])

  if (!open || !anchor || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className={cn(
        'fixed z-80 w-52 overflow-hidden rounded-xl border border-dash-border bg-canvas py-1 shadow-lg',
        !coords && 'invisible'
      )}
      style={coords ? { top: coords.top, left: coords.left } : { top: 0, left: 0 }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  )
}
