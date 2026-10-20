// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { currentTheme, setTheme } from '@/lib/theme'

function mockSystemTheme(dark: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: dark && query === '(prefers-color-scheme: dark)', media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  )
}

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('theme', () => {
  it('follows the system until the visitor chooses', () => {
    mockSystemTheme(true)
    expect(currentTheme()).toBe('dark')
    mockSystemTheme(false)
    expect(currentTheme()).toBe('light')
  })

  it('pins a chosen theme over the system and applies it to the document', () => {
    mockSystemTheme(true)
    setTheme('light')

    expect(currentTheme()).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })
})
