import { useSyncExternalStore } from 'react'

/**
 * Light or dark, for the whole site.
 *
 * A visitor who has never chosen follows the operating system. Choosing once pins that
 * choice in this browser. The value lands on `<html data-theme>`, which every colour
 * token in `styles/index.css` keys off; `index.html` applies it before the first paint
 * so a reload never flashes the other theme.
 */
export type Theme = 'light' | 'dark'

// Read by the inline script in `index.html`; keep the two in step.
const STORAGE_KEY = 'new-api:web-custom:theme'
const SYSTEM_DARK = '(prefers-color-scheme: dark)'

const listeners = new Set<() => void>()

function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.(SYSTEM_DARK).matches ? 'dark' : 'light'
}

export function currentTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return storedTheme() ?? systemTheme()
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  for (const listener of listeners) listener()
}

export function setTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Private mode: the choice still applies to this page.
  }
  applyTheme(theme)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const media = window.matchMedia?.(SYSTEM_DARK)
  // Follow the system only while the visitor has not chosen.
  const onSystemChange = () => {
    if (storedTheme() === null) applyTheme(systemTheme())
  }
  media?.addEventListener('change', onSystemChange)
  return () => {
    listeners.delete(listener)
    media?.removeEventListener('change', onSystemChange)
  }
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light')
}
