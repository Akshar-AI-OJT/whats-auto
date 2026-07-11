export interface NavLink {
  label: string
  href: string
}

export interface NavDropdown {
  id: string
  label: string
  href?: string
  items: NavLink[]
}

export interface NavData {
  brand: string
  pricing: NavLink
  features: NavDropdown
  integrations: NavDropdown
  login: NavLink
  getStarted: NavLink
}
