'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'wa-admin-sidebar-collapsed'
/** Below xl: fixed sidebar stays collapsed (tablet / small laptop). */
const COLLAPSE_MQ = '(max-width: 1279px)'

type AdminChromeContextValue = {
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  toggleCollapsed: () => void
  sidebarWidthPx: number
}

const AdminChromeContext = createContext<AdminChromeContextValue | null>(null)

function readStoredCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeStoredCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // ignore storage errors
  }
}

export function AdminChromeProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(COLLAPSE_MQ)

    const applyViewport = () => {
      if (mql.matches) {
        setCollapsedState(true)
      } else {
        setCollapsedState(readStoredCollapsed())
      }
    }

    applyViewport()
    mql.addEventListener('change', applyViewport)
    return () => mql.removeEventListener('change', applyViewport)
  }, [])

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value)
    writeStoredCollapsed(value)
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev
      writeStoredCollapsed(next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      toggleCollapsed,
      sidebarWidthPx: collapsed ? 80 : 260,
    }),
    [collapsed, setCollapsed, toggleCollapsed]
  )

  return (
    <AdminChromeContext.Provider value={value}>{children}</AdminChromeContext.Provider>
  )
}

export function useAdminChrome() {
  const ctx = useContext(AdminChromeContext)
  if (!ctx) {
    throw new Error('useAdminChrome must be used within AdminChromeProvider')
  }
  return ctx
}
