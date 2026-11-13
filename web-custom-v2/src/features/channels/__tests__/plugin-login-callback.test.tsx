// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post } }))
vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ key: 'acme' }) }))

const { PluginLoginCallbackPage } = await import('@/features/channels/plugin-login/PluginLoginCallbackPage')

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PluginLoginCallbackPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  get.mockResolvedValue({ data: { success: true, data: [{ key: 'acme', name: 'Acme Cloud', models: [] }] } })
  window.history.replaceState(null, '', '/oauth/plugin/acme/callback?code=one-time&state=s1')
})

afterEach(cleanup)

describe('PluginLoginCallbackPage', () => {
  it('forwards the whole vendor query once, then clears the code from the address bar', async () => {
    post.mockResolvedValue({
      data: { success: true, data: { channel_id: 7, step: { type: 'done', credential: { index: 0, account_id: 'ops@acme' } } } },
    })
    renderPage()

    expect(await screen.findByText('Credential saved for ops@acme.')).toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith(
      '/api/channel/plugin_login/callback',
      { plugin: 'acme', params: { code: 'one-time', state: 's1' } },
      expect.anything(),
    )
    expect(window.location.search).toBe('')
    expect(screen.getByRole('heading', { name: 'Log in to Acme Cloud' })).toBeInTheDocument()
  })

  it('shows the server refusal instead of claiming success', async () => {
    post.mockResolvedValue({ data: { success: false, message: 'Login state expired' } })
    renderPage()

    expect(await screen.findByText('Login state expired')).toBeInTheDocument()
    expect(screen.queryByText(/Credential saved/)).not.toBeInTheDocument()
  })
})
