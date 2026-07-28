export interface NavAnchorLink {
  label: string
  /**
   * Landing in-page anchor (`#pricing`) or absolute path (`/features`).
   */
  href: string
  /** DOM id without `#` for landing scroll spy, or route key (e.g. `features`). */
  sectionId: string
  /** When true, always navigate to `href` (e.g. `/features`) instead of landing anchors. */
  isPageLink?: boolean
}

export interface NavData {
  brand: string
  links: NavAnchorLink[]
  login: { label: string; href: string }
  getStarted: { label: string; href: string }
}
