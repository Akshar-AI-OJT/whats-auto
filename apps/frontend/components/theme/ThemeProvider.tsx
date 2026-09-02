'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { usePathname } from 'next/navigation'
import { pathAllowsDarkTheme } from '@/components/theme/theme-scope'

export type ThemeMode = 'light' | 'dark' | 'system'

type ThemeContextValue = {
  theme: ThemeMode
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

const STORAGE_KEY = 'wa-theme'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemDark() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyThemeClass(resolved: 'light' | 'dark', scope: 'app' | 'public') {
  const root = document.documentElement
  const allowDark = scope === 'app'
  root.classList.toggle('dark', allowDark && resolved === 'dark')
  root.classList.toggle('light-locked', !allowDark)
  root.style.colorScheme = allowDark && resolved === 'dark' ? 'dark' : 'light'
  root.dataset.themeScope = scope
}

function readStoredTheme(): ThemeMode {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // ignore
  }
  return 'system'
}

function subscribeSystemTheme(onStoreChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onStoreChange)
  return () => media.removeEventListener('change', onStoreChange)
}

function subscribeStorageTheme(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange)
  return () => window.removeEventListener('storage', onStoreChange)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/'
  const systemDark = useSyncExternalStore(subscribeSystemTheme, getSystemDark, () => false)

  // Always start as 'system' on the server; on the client, immediately read
  // localStorage via useSyncExternalStore — no useEffect, no extra render.
  const storedTheme = useSyncExternalStore(
    subscribeStorageTheme,
    readStoredTheme,
    () => 'system' as ThemeMode
  )

  // Allow the user to temporarily override without persisting until setTheme is
  // called (e.g. live preview). Falls back to the persisted stored value.
  const [themeOverride, setThemeOverride] = useState<ThemeMode | null>(null)
  const theme: ThemeMode = themeOverride ?? storedTheme

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  const allowDark = pathAllowsDarkTheme(pathname)
  const appearance: 'light' | 'dark' = allowDark ? resolvedTheme : 'light'

  useEffect(() => {
    applyThemeClass(appearance, allowDark ? 'app' : 'public')
  }, [appearance, allowDark])

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeOverride(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [resolvedTheme, setTheme])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
