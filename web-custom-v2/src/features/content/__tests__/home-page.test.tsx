// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ApiClientModule from '@/lib/api/client'

const mocks = vi.hoisted(() => ({ getJson: vi.fn() }))

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClientModule>()),
  getJson: mocks.getJson,
}))

const { HomePage } = await import('@/features/content/HomePage')
const { renderPublicPage } = await import('@/features/content/__tests__/render-public-page')

function respond(homeContent: string | Promise<string>) {
  mocks.getJson.mockImplementation((url: string) => {
    if (url === '/api/status') return Promise.resolve({ quota_per_unit: 500_000 })
    if (url === '/api/home_page_content') return Promise.resolve(homeContent)
    return Promise.reject(new Error(`unexpected request: ${url}`))
  })
}

beforeEach(() => {
  mocks.getJson.mockReset()
  window.localStorage.clear()
})

afterEach(cleanup)

describe('HomePage', () => {
  it('renders the Models.one landing page when no custom content is configured', async () => {
    // The live server answers `data: ""` out of the box; that is the default state.
    respond('')
    await renderPublicPage(HomePage)

    expect(
      await screen.findByRole('heading', { name: 'Scale Without Friction' }),
    ).toBeInTheDocument()
  })

  it('replaces the landing page with the operator markdown when one is configured', async () => {
    respond('# Welcome to Acme AI\n\nInternal gateway for the platform team.')
    await renderPublicPage(HomePage)

    expect(await screen.findByRole('heading', { name: 'Welcome to Acme AI' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Scale Without Friction' })).not.toBeInTheDocument()
  })

  it('sanitizes operator HTML before it reaches the page', async () => {
    respond('<section><h1>Acme AI</h1><script>steal()</script></section>')
    await renderPublicPage(HomePage)

    expect(await screen.findByRole('heading', { name: 'Acme AI' })).toBeInTheDocument()
    expect(document.body.querySelector('script')).toBeNull()
    expect(document.body.innerHTML).not.toContain('steal()')
  })

  it('frames a configured URL instead of fetching it', async () => {
    respond('https://acme.example/landing')
    await renderPublicPage(HomePage)

    const frame = await screen.findByTitle('Home')
    expect(frame.tagName).toBe('IFRAME')
    // The frame must stay in an opaque origin: no reach into this document or its token.
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    // The home page is the one document allowed to carry its own top-level nav links.
    expect(frame.getAttribute('sandbox')).toContain('allow-top-navigation-by-user-activation')
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('does not flash the marketing page while the request is still open', async () => {
    respond(new Promise<string>(() => {}))
    await renderPublicPage(HomePage)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Scale Without Friction' })).not.toBeInTheDocument()
  })

  it('paints the cached custom page immediately on a repeat visit', async () => {
    window.localStorage.setItem('home_page_content', '# Cached Acme')
    respond(new Promise<string>(() => {}))
    await renderPublicPage(HomePage)

    expect(screen.getByRole('heading', { name: 'Cached Acme' })).toBeInTheDocument()
  })

  it('falls back to the landing page when the request fails', async () => {
    mocks.getJson.mockImplementation((url: string) => {
      if (url === '/api/status') return Promise.resolve({ quota_per_unit: 500_000 })
      return Promise.reject(new Error('offline'))
    })
    await renderPublicPage(HomePage)

    expect(
      await screen.findByRole('heading', { name: 'Scale Without Friction' }),
    ).toBeInTheDocument()
  })

  it('clears a stale cache once the operator removes the custom page', async () => {
    window.localStorage.setItem('home_page_content', '# Cached Acme')
    respond('')
    await renderPublicPage(HomePage)

    expect(
      await screen.findByRole('heading', { name: 'Scale Without Friction' }),
    ).toBeInTheDocument()
    expect(window.localStorage.getItem('home_page_content')).toBeNull()
  })
})
