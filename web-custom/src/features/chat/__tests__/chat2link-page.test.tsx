// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }

const historyPush = vi.fn()
const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post, put, delete: del } }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: LinkProps) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useParams: () => ({}),
  useRouter: () => ({ history: { push: historyPush } }),
}))

const { Chat2LinkPage } = await import('@/features/chat/Chat2LinkPage')

const LOBE_TEMPLATE =
  'https://chat-preview.lobehub.com/?settings={"keyVaults":{"openai":{"apiKey":"{key}","baseURL":"{address}/v1"}}}'

/** The desktop-only prefix of the seeded catalogue, which `/chat2link` must skip past. */
const desktopOnly = [
  { 'Cherry Studio': 'cherrystudio://providers/api-keys?v=1&data={cherryConfig}' },
  { 流畅阅读: 'fluentread' },
  { OpenCat: 'opencat://team/join?domain={address}&token={key}' },
]

const seededChats = [...desktopOnly, { 'Lobe Chat 官方示例': LOBE_TEMPLATE }]

const RAW_KEY = 'ZsbYkbcr7wIDZIaZvWoOu9AR9Uw5xhrtiRgPERsvLIVqDbvu'

const enabledToken = {
  accessed_time: 1_787_983_215,
  allow_ips: '',
  auto_groups: 'default,vip',
  created_time: 1_787_983_215,
  cross_group_retry: false,
  expired_time: -1,
  group: 'auto',
  id: 3,
  key: 'ZsbY**********Dbvu',
  model_limits: '',
  model_limits_enabled: false,
  name: 'Developer Sandbox',
  remain_quota: 500_000,
  status: 1,
  unlimited_quota: true,
  used_quota: 0,
  user_id: 1,
}

type ServerState = {
  chats: unknown
  tokens: (typeof enabledToken)[]
  statusFails: boolean
}

let server: ServerState
let redirect: ReturnType<typeof vi.fn>

function envelope(data: unknown) {
  return Promise.resolve({ data: { data, message: '', success: true } })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<Chat2LinkPage redirect={redirect} />, { wrapper })
}

beforeEach(() => {
  server = { chats: seededChats, statusFails: false, tokens: [enabledToken] }
  redirect = vi.fn()
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/status') {
      if (server.statusFails) return Promise.reject(new Error('status is unavailable'))
      return envelope({ chats: server.chats, server_address: 'http://localhost:3000' })
    }
    if (url === '/api/token/') {
      return envelope({ items: server.tokens, page: 1, page_size: 50, total: server.tokens.length })
    }
    return Promise.reject(new Error(`unexpected GET ${url}`))
  })

  post.mockImplementation((url: string) => {
    if (url === `/api/token/${enabledToken.id}/key`) return envelope({ key: RAW_KEY })
    return Promise.reject(new Error(`unexpected POST ${url}`))
  })
})

afterEach(() => {
  cleanup()
})

describe('Chat2LinkPage', () => {
  it('skips the desktop presets and leaves for the first web one, exactly once', async () => {
    renderPage()

    await waitFor(() => {
      expect(redirect).toHaveBeenCalledTimes(1)
    })

    const target = new URL(String(redirect.mock.calls[0]?.[0]))
    expect(target.origin).toBe('https://chat-preview.lobehub.com')
    expect(target.href).toContain(`sk-${RAW_KEY}`)
    expect(await screen.findByText('Taking you to https://chat-preview.lobehub.com')).toBeInTheDocument()
  })

  it('lets the user re-trigger the hand-off', async () => {
    renderPage()
    await waitFor(() => {
      expect(redirect).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Continue now' }))
    expect(redirect).toHaveBeenCalledTimes(2)
  })

  it('explains itself instead of redirecting when no preset is a web page', async () => {
    server.chats = desktopOnly
    renderPage()

    expect(await screen.findByText('No web chat client is configured')).toBeInTheDocument()
    expect(redirect).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('explains itself instead of redirecting when no key is enabled', async () => {
    server.tokens = [{ ...enabledToken, status: 2 }]
    renderPage()

    expect(await screen.findByRole('heading', { name: 'No enabled API key' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to API keys' })).toHaveAttribute('href', '/settings')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('refuses a template whose origin is not written out, and sends nothing', async () => {
    server.chats = [{ Sneaky: 'https://{key}.evil.example/' }]
    renderPage()

    expect(await screen.findByText('This chat client is misconfigured')).toBeInTheDocument()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('offers a retry when the preset list cannot be loaded', async () => {
    server.statusFails = true
    renderPage()

    expect(await screen.findByText('Could not load the chat clients')).toBeInTheDocument()
    expect(redirect).not.toHaveBeenCalled()

    server.statusFails = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => {
      expect(redirect).toHaveBeenCalledTimes(1)
    })
  })
})
