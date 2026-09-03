'use client'

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import {
  Building2,
  CreditCard,
  FileText,
  GitBranch,
  Layers,
  Loader2,
  Megaphone,
  MessageSquare,
  Search,
  User,
  Users,
} from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { api, type ApiError, type GlobalSearchResult, type GlobalSearchResultType } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import {
  GLOBAL_SEARCH_DEBOUNCE_MS,
  groupSearchResults,
  hrefForSearchResult,
  unwrapGlobalSearch,
} from '@/lib/global-search'
import { cn } from '@/lib/utils'

type GlobalSearchProps = {
  scope: 'organization' | 'platform'
  className?: string
  onOpenChange?: (open: boolean) => void
}

const TYPE_ICONS: Record<GlobalSearchResultType, typeof Search> = {
  contact: User,
  conversation: MessageSquare,
  campaign: Megaphone,
  template: FileText,
  flow: GitBranch,
  customer_group: Users,
  organization: Building2,
  user: User,
  plan: Layers,
  subscription: CreditCard,
  invoice: FileText,
}

const EMPTY_RESULTS: GlobalSearchResult[] = []

function detectMac() {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
}

function subscribeNoop() {
  return () => {}
}

function subscribeLg(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  const media = window.matchMedia('(min-width: 1024px)')
  media.addEventListener('change', onStoreChange)
  return () => media.removeEventListener('change', onStoreChange)
}

function getIsLg() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(min-width: 1024px)').matches
}

function searchErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as ApiError).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export function GlobalSearch({ scope, className, onOpenChange }: GlobalSearchProps) {
  const t = useTranslations(scope === 'platform' ? 'admin.navbar' : 'dashboard.topbar')
  const tSearch = useTranslations('globalSearch')
  const router = useRouter()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchId = useId()
  const listboxId = `${searchId}-results`
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const isMac = useSyncExternalStore(subscribeNoop, detectMac, () => false)
  const isLg = useSyncExternalStore(subscribeLg, getIsLg, () => false)

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, GLOBAL_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [query])

  const enabled = debouncedQuery.length > 0
  const searchQuery = useQuery({
    queryKey: queryKeys.search.query(scope, debouncedQuery),
    queryFn: async () => {
      const response =
        scope === 'platform'
          ? await api.superAdmin.search.query(debouncedQuery)
          : await api.search.query(debouncedQuery)
      return unwrapGlobalSearch(response.data)
    },
    enabled,
    staleTime: 15_000,
    retry: false,
  })

  const results = searchQuery.data?.results ?? EMPTY_RESULTS
  const groups = useMemo(() => groupSearchResults(results), [results])
  const flatResults = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const panelOpen = focused && query.trim().length > 0
  const showLoading = panelOpen && enabled && searchQuery.isFetching
  const showError = panelOpen && enabled && searchQuery.isError
  const showEmpty =
    panelOpen && enabled && !searchQuery.isFetching && !searchQuery.isError && results.length === 0
  const showResults = panelOpen && enabled && !searchQuery.isFetching && results.length > 0
  const waitingForDebounce = panelOpen && query.trim().length > 0 && query.trim() !== debouncedQuery

  useEffect(() => {
    onOpenChange?.(panelOpen)
  }, [panelOpen, onOpenChange])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isShortcut =
        (event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)
      if (!isShortcut) return

      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return
      }

      event.preventDefault()
      searchInputRef.current?.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!panelOpen) return

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setFocused(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [panelOpen])

  function navigateTo(result: GlobalSearchResult) {
    const href = hrefForSearchResult(scope, result)
    if (!href) return
    setFocused(false)
    setQuery('')
    router.push(href)
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setFocused(false)
      searchInputRef.current?.blur()
      return
    }

    if (!showResults || flatResults.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % flatResults.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current <= 0 ? flatResults.length - 1 : current - 1))
      return
    }

    if (event.key === 'Enter' && activeIndex >= 0) {
      const selected = flatResults[activeIndex]
      if (selected) {
        event.preventDefault()
        navigateTo(selected)
      }
    }
  }

  let optionIndex = -1

  return (
    <div ref={rootRef} className={cn('group/search relative min-w-0', className)}>
      <label htmlFor={searchId} className="sr-only">
        {t('searchLabel')}
      </label>
      <Search
        className={cn(
          'pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute',
          'transition-[transform,color] duration-200 ease-out',
          'group-hover/search:scale-110 group-hover/search:text-positive-deep',
          'group-focus-within/search:scale-110 group-focus-within/search:rotate-12 group-focus-within/search:text-positive-deep',
          focused && 'scale-110 rotate-12 text-positive-deep'
        )}
        aria-hidden
      />
      <input
        ref={searchInputRef}
        id={searchId}
        type="search"
        value={query}
        placeholder={isLg ? t('searchPlaceholder') : t('searchPlaceholderShort')}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={panelOpen}
        aria-controls={panelOpen ? listboxId : undefined}
        aria-activedescendant={
          activeIndex >= 0 ? `${searchId}-option-${activeIndex}` : undefined
        }
        onChange={(event) => {
          setQuery(event.target.value)
          setActiveIndex(-1)
        }}
        onFocus={() => setFocused(true)}
        onKeyDown={onInputKeyDown}
        className={cn(
          'h-9 w-full min-w-0 rounded-xl border border-dash-border bg-dash-surface/90 py-1.5 pl-9 text-sm text-ink outline-none',
          'pr-3 lg:pr-[4.5rem]',
          'placeholder:truncate placeholder:text-mute',
          'transition-[border-color,box-shadow,background-color] duration-200',
          'hover:border-dash-border-strong',
          'focus-visible:border-primary/55 focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-primary/30'
        )}
      />
      {showLoading || waitingForDebounce ? (
        <Loader2
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-mute lg:right-14"
          aria-hidden
        />
      ) : (
        <kbd
          className={cn(
            'pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 items-center gap-0.5 lg:inline-flex',
            'rounded-md border border-dash-border bg-canvas px-1.5 py-0.5',
            'text-[10px] font-semibold tracking-wide text-mute',
            'shadow-[0_1px_0_rgb(15_23_42/0.04)]',
            'transition-[border-color,color,opacity] duration-200',
            focused && 'border-primary/35 text-positive-deep'
          )}
          aria-label={t('searchShortcutLabel', {
            shortcut: isMac ? '⌘K' : 'Ctrl+K',
          })}
        >
          <span>{isMac ? '⌘' : 'Ctrl'}</span>
          <span className="opacity-60">+</span>
          <span>K</span>
        </kbd>
      )}

      {panelOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={tSearch('resultsLabel')}
          className={cn(
            'absolute top-[calc(100%+0.45rem)] left-0 z-50 w-full overflow-hidden rounded-2xl border border-dash-border bg-canvas',
            'dash-elevated-shadow max-h-[min(24rem,70vh)] overflow-y-auto'
          )}
        >
          {showLoading || waitingForDebounce ? (
            <p className="flex items-center gap-2 px-3 py-3 text-sm text-mute">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {tSearch('loading')}
            </p>
          ) : null}

          {showError ? (
            <p className="px-3 py-3 text-sm text-negative">
              {searchErrorMessage(searchQuery.error, tSearch('error'))}
            </p>
          ) : null}

          {showEmpty ? <p className="px-3 py-3 text-sm text-mute">{tSearch('noResults')}</p> : null}

          {showResults
            ? groups.map((group) => (
                <div key={group.type} className="border-b border-dash-border last:border-b-0">
                  <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-mute uppercase">
                    {tSearch(`types.${group.type}`)}
                  </p>
                  {group.items.map((item) => {
                    optionIndex += 1
                    const index = optionIndex
                    const Icon = TYPE_ICONS[item.type]
                    const active = index === activeIndex
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        id={`${searchId}-option-${index}`}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onMouseEnter={() => setActiveIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => navigateTo(item)}
                        className={cn(
                          'flex w-full items-start gap-2.5 px-3 py-2 text-left',
                          'transition-colors duration-150',
                          active ? 'bg-primary-pale' : 'hover:bg-dash-surface'
                        )}
                      >
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-dash-surface text-mute">
                          <Icon className="size-3.5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {item.title}
                          </span>
                          {item.description ? (
                            <span className="block truncate text-xs text-mute">{item.description}</span>
                          ) : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))
            : null}
        </div>
      ) : null}
    </div>
  )
}
