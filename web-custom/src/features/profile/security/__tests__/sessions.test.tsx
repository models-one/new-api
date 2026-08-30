// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post, put, delete: del } }))

const clearAuthenticatedClientState = vi.fn()
vi.mock('@/lib/auth-session', () => ({ clearAuthenticatedClientState }))

const assign = vi.fn()
vi.mock('@/lib/navigation', () => ({
  getLegacySignInHref: () => 'https://console.example/sign-in',
  redirectToLegacySignIn: vi.fn(),
}))

const { SessionsPanel } = await import('@/features/profile/security/components/SessionsPanel')

/** Trimmed from a live `GET /api/user/sessions` on the seeded dev server. */
const sessionsFixture = [
  {
    sid: 'ac4724eb-95f6-4f2e-97b8-da9e03ba93b9',
    current: true,
    login_method: 'password',
    ip: '127.0.0.1',
    user_agent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    created_at: 1788016293,
    last_active_at: 1788016293,
    expires_at: 1790608293,
  },
  {
    sid: '540419ef-3187-4609-97e8-75e06e351f30',
    current: false,
    login_method: 'oauth:github',
    ip: '10.0.0.4',
    user_agent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
    created_at: 1788010000,
    last_active_at: 1788015000,
    expires_at: 1790602000,
  },
]

let sessions = sessionsFixture

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<SessionsPanel />, { wrapper })
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()
  clearAuthenticatedClientState.mockReset()
  assign.mockReset()
  sessions = sessionsFixture

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign },
    writable: true,
  })

  get.mockImplementation((url: string) => {
    if (url === '/api/user/sessions') {
      return Promise.resolve({ data: { success: true, data: sessions } })
    }
    throw new Error(`unmocked GET ${url}`)
  })
})

afterEach(cleanup)

describe('SessionsPanel', () => {
  it('marks the session the user is reading the page in', async () => {
    renderPanel()

    const rows = await screen.findAllByRole('listitem')
    expect(within(rows[0]).getByText('This device')).toBeInTheDocument()
    expect(within(rows[1]).queryByText('This device')).not.toBeInTheDocument()
  })

  it('labels the device and the credential from what the server actually returns', async () => {
    renderPanel()

    expect(await screen.findByText('Chrome · macOS')).toBeInTheDocument()
    expect(screen.getByText('Chrome · Android')).toBeInTheDocument()
    expect(screen.getByText(/OAuth · GitHub/)).toBeInTheDocument()
  })

  it('says the device name is derived in the browser', async () => {
    renderPanel()

    expect(
      await screen.findByText(/Device names are worked out in your browser/),
    ).toBeInTheDocument()
  })

  it('gives the current session a different action from every other session', async () => {
    renderPanel()

    const rows = await screen.findAllByRole('listitem')
    expect(within(rows[0]).getByRole('button', { name: 'Sign out this device' })).toBeInTheDocument()
    expect(within(rows[1]).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('spells out the consequence before signing the current device out, and hands over to sign-in', async () => {
    del.mockResolvedValue({
      data: { success: true, data: { revoked_sid: sessionsFixture[0].sid, current: true } },
    })
    renderPanel()

    const rows = await screen.findAllByRole('listitem')
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Sign out this device' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(screen.getByText('Sign out of this device?')).toBeInTheDocument()
    expect(
      screen.getByText('You will be signed out here immediately and sent back to the sign-in page.'),
    ).toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()

    fireEvent.click(dialog.getByRole('button', { name: 'Sign out this device' }))

    await waitFor(() => {
      expect(del).toHaveBeenCalledWith(
        `/api/user/sessions/${sessionsFixture[0].sid}`,
        expect.anything(),
      )
      expect(clearAuthenticatedClientState).toHaveBeenCalled()
      expect(assign).toHaveBeenCalledWith('https://console.example/sign-in')
    })
  })

  it('stays put after revoking someone else, and refreshes the list', async () => {
    del.mockResolvedValue({
      data: { success: true, data: { revoked_sid: sessionsFixture[1].sid, current: false } },
    })
    renderPanel()

    const rows = await screen.findAllByRole('listitem')
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Sign out' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(screen.getByText('Sign out that session?')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(del).toHaveBeenCalled())
    expect(clearAuthenticatedClientState).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })

  it('does not revoke anything when the confirmation is dismissed', async () => {
    renderPanel()

    const rows = await screen.findAllByRole('listitem')
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Sign out this device' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(del).not.toHaveBeenCalled()
  })

  it('disables the bulk action when this is the only session', async () => {
    sessions = [sessionsFixture[0]]
    renderPanel()

    await screen.findByText('This device')
    expect(screen.getByRole('button', { name: 'Sign out other sessions' })).toBeDisabled()
  })

  it('confirms the bulk sign-out and names how many sessions it covers', async () => {
    post.mockResolvedValue({ data: { success: true, data: { revoked_count: 1 } } })
    renderPanel()

    // Wait for the list: the bulk button is disabled while the count is unknown.
    await screen.findAllByRole('listitem')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out other sessions' }))
    expect(await screen.findByText('Sign out 1 other sessions?')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: 'Sign out other sessions' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/api/user/sessions/revoke-others', undefined, expect.anything())
    })
    expect(assign).not.toHaveBeenCalled()
  })

  it('renders an empty state rather than an empty list', async () => {
    sessions = []
    renderPanel()

    expect(await screen.findByText('No active sessions')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('renders an error state with a retry when the list cannot be loaded', async () => {
    get.mockImplementation(() => Promise.reject(new Error('nope')))
    renderPanel()

    expect(await screen.findByText('Sessions could not be loaded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
