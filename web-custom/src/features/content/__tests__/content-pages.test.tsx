// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ApiClientModule from '@/lib/api/client'

const mocks = vi.hoisted(() => ({ getJson: vi.fn() }))

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClientModule>()),
  getJson: mocks.getJson,
}))

const { AboutPage } = await import('@/features/content/AboutPage')
const { PrivacyPolicyPage } = await import('@/features/content/PrivacyPolicyPage')
const { UserAgreementPage } = await import('@/features/content/UserAgreementPage')
const { renderPublicPage } = await import('@/features/content/__tests__/render-public-page')

type Responses = {
  document?: string | Promise<string>
  legalFlags?: boolean
}

function respond(options: Responses = {}) {
  const { document: documentContent = '', legalFlags = false } = options

  mocks.getJson.mockImplementation((url: string) => {
    if (url === '/api/status') {
      return Promise.resolve({
        privacy_policy_enabled: legalFlags,
        quota_per_unit: 500_000,
        user_agreement_enabled: legalFlags,
      })
    }
    if (url === '/api/about' || url === '/api/privacy-policy' || url === '/api/user-agreement') {
      return Promise.resolve(documentContent)
    }
    return Promise.reject(new Error(`unexpected request: ${url}`))
  })
}

beforeEach(() => {
  mocks.getJson.mockReset()
})

afterEach(cleanup)

describe('content document pages', () => {
  it('announces a loading state before the document arrives', async () => {
    respond({ document: new Promise<string>(() => {}) })
    await renderPublicPage(UserAgreementPage)

    expect(screen.getByText('Loading document')).toBeInTheDocument()
  })

  it('shows a real empty state for an unconfigured instance', async () => {
    // This is what the live server returns out of the box: success with data "".
    respond({ document: '' })
    await renderPublicPage(UserAgreementPage)

    expect(
      await screen.findByRole('heading', { name: 'No user agreement has been published' }),
    ).toBeInTheDocument()
  })

  it('renders markdown as formatted content', async () => {
    respond({ document: '# Our terms\n\n- Be nice\n- Pay on time' })
    await renderPublicPage(UserAgreementPage)

    expect(await screen.findByRole('heading', { name: 'Our terms' })).toBeInTheDocument()
    expect(screen.getByText('Be nice')).toBeInTheDocument()
  })

  it('renders HTML but strips anything executable', async () => {
    respond({
      document: '<div><h2>Privacy</h2><p>We keep logs.</p><script>steal()</script></div>',
    })
    await renderPublicPage(PrivacyPolicyPage)

    expect(await screen.findByRole('heading', { name: 'Privacy' })).toBeInTheDocument()
    expect(screen.getByText('We keep logs.')).toBeInTheDocument()
    expect(document.body.querySelector('script')).toBeNull()
    expect(document.body.innerHTML).not.toContain('steal()')
  })

  it('frames an http(s) document in a sandboxed iframe', async () => {
    respond({ document: 'https://example.com/terms' })
    await renderPublicPage(UserAgreementPage)

    const frame = await screen.findByTitle('User Agreement')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame).toHaveAttribute('src', 'https://example.com/terms')
    expect(frame.getAttribute('sandbox')).toBe(
      'allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts',
    )
    // No allow-same-origin: the frame must not reach this document or its token.
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(screen.getByRole('link', { name: /Open it in a new tab/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    )
  })

  it('renders an unformatted notice verbatim, without interpreting it', async () => {
    respond({ document: 'Maintenance tonight.\nBack at 02:00.' })
    await renderPublicPage(AboutPage)

    expect(await screen.findByText(/Maintenance tonight\./)).toBeInTheDocument()
  })

  it('offers a retry when the document request fails', async () => {
    mocks.getJson.mockImplementation((url: string) => {
      if (url === '/api/status') return Promise.resolve({ quota_per_unit: 500_000 })
      return Promise.reject(new Error('offline'))
    })
    await renderPublicPage(AboutPage)

    expect(await screen.findByText('This document could not be loaded.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('public frame legal links', () => {
  it('links only to the documents /api/status reports as configured', async () => {
    respond({ document: '', legalFlags: true })
    await renderPublicPage(AboutPage)

    const nav = await screen.findByRole('navigation', { name: 'Legal and policy links' })
    expect(nav).toHaveTextContent('User Agreement')
    expect(nav).toHaveTextContent('Privacy Policy')
  })

  it('hides documents the operator never configured', async () => {
    respond({ document: '', legalFlags: false })
    await renderPublicPage(AboutPage)

    const nav = await screen.findByRole('navigation', { name: 'Legal and policy links' })
    await waitFor(() => expect(nav).toHaveTextContent('About'))
    expect(nav).not.toHaveTextContent('User Agreement')
    expect(nav).not.toHaveTextContent('Privacy Policy')
  })
})
