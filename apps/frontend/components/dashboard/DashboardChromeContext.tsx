'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'wa-dashboard-sidebar-collapsed'
/** Below xl: fixed sidebar stays collapsed (tablet / small laptop). */
const COLLAPSE_MQ = '(max-width: 1279px)'

type DashboardChromeContextValue = {
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  toggleCollapsed: () => void
  sidebarWidthPx: number
}

const DashboardChromeContext = createContext<DashboardChromeContextValue | null>(null)

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

export function DashboardChromeProvider({ children }: { children: React.ReactNode }) {
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
    <DashboardChromeContext.Provider value={value}>{children}</DashboardChromeContext.Provider>
  )
}

export function useDashboardChrome() {
  const ctx = useContext(DashboardChromeContext)
  if (!ctx) {
    throw new Error('useDashboardChrome must be used within DashboardChromeProvider')
  }
  return ctx
}
