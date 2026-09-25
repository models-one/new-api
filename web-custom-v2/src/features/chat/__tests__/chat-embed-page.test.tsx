// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

const { ChatEmbedView, IFRAME_PERMISSIONS, IFRAME_REFERRER_POLICY, IFRAME_SANDBOX } = await import(
  '@/features/chat/ChatEmbedPage'
)

/** `chats` verbatim from `GET /api/status` on the seeded dev server. */
const seededChats = [
  { 'Cherry Studio': 'cherrystudio://providers/api-keys?v=1&data={cherryConfig}' },
  { AionUI: 'aionui://provider/add?v=1&data={aionuiConfig}' },
  { 流畅阅读: 'fluentread' },
  { 'CC Switch': 'ccswitch' },
  { DeepChat: 'deepchat://provider/install?v=1&data={deepchatConfig}' },
  {
    'Lobe Chat 官方示例':
      'https://chat-preview.lobehub.com/?settings={"keyVaults":{"openai":{"apiKey":"{key}","baseURL":"{address}/v1"}}}',
  },
  {
    'AI as Workspace':
      'https://aiaw.app/set-provider?provider={"type":"openai","settings":{"apiKey":"{key}","baseURL":"{address}/v1","compatibility":"strict"}}',
  },
  { 'AMA 问天': 'ama://set-api-key?server={address}&key={key}' },
  { OpenCat: 'opencat://team/join?domain={address}&token={key}' },
]

const LOBE_INDEX = 5
const RAW_KEY = 'ZsbYkbcr7wIDZIaZvWoOu9AR9Uw5xhrtiRgPERsvLIVqDbvu'

/** One row of `GET /api/token/?p=1&page_size=50`, masked `key` and all. */
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
  revealFails: boolean
}

let server: ServerState

function envelope(data: unknown) {
  return Promise.resolve({ data: { data, message: '', success: true } })
}

function renderEmbed(chatId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<ChatEmbedView chatId={chatId} />, { wrapper })
}

beforeEach(() => {
  server = { chats: seededChats, revealFails: false, statusFails: false, tokens: [enabledToken] }
  historyPush.mockReset()
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/status') {
      if (server.statusFails) return Promise.reject(new Error('status is unavailable'))
      return envelope({
        chats: server.chats,
        quota_per_unit: 500_000,
        server_address: 'http://localhost:3000',
      })
    }
    if (url === '/api/token/') {
      return envelope({
        items: server.tokens,
        page: 1,
        page_size: 50,
        total: server.tokens.length,
      })
    }
    return Promise.reject(new Error(`unexpected GET ${url}`))
  })

  post.mockImplementation((url: string) => {
    if (url === `/api/token/${enabledToken.id}/key`) {
      if (server.revealFails) return Promise.reject(new Error('key reveal refused'))
      return envelope({ key: RAW_KEY })
    }
    return Promise.reject(new Error(`unexpected POST ${url}`))
  })
})

afterEach(() => {
  cleanup()
})

describe('ChatEmbedView — the embed', () => {
  it('embeds the web preset with the key filled in and a locked-down frame', async () => {
    renderEmbed(String(LOBE_INDEX))

    const frame = await screen.findByTitle('Lobe Chat 官方示例 chat client')

    expect(frame).toHaveAttribute('sandbox', IFRAME_SANDBOX)
    expect(frame).toHaveAttribute('referrerpolicy', IFRAME_REFERRER_POLICY)
    expect(frame).toHaveAttribute('allow', IFRAME_PERMISSIONS)

    const source = frame.getAttribute('src') ?? ''
    expect(new URL(source).origin).toBe('https://chat-preview.lobehub.com')
    expect(source).toContain(`sk-${RAW_KEY}`)
    expect(source).toContain(encodeURIComponent('http://localhost:3000'))
  })

  it('never grants the frame top-level navigation', () => {
    expect(IFRAME_SANDBOX).not.toContain('allow-top-navigation')
    expect(IFRAME_SANDBOX).not.toContain('allow-popups-to-escape-sandbox')
  })

  it('keeps the secret masked in the connection details until it is revealed', async () => {
    renderEmbed(String(LOBE_INDEX))
    await screen.findByTitle('Lobe Chat 官方示例 chat client')

    fireEvent.click(screen.getByRole('button', { name: 'Connection details' }))

    const reveal = await screen.findByRole('button', { name: 'Show API key' })
    expect(screen.queryByText(`sk-${RAW_KEY}`)).not.toBeInTheDocument()

    fireEvent.click(reveal)
    expect(await screen.findByText(`sk-${RAW_KEY}`)).toBeInTheDocument()
  })
})

describe('ChatEmbedView — presets that cannot be embedded', () => {
  it('refuses a desktop-protocol preset and never asks for the key', async () => {
    renderEmbed('0')

    expect(await screen.findByText(/runs outside the browser/)).toBeInTheDocument()
    expect(
      screen.getByText(/opens through the cherrystudio: protocol handler/),
    ).toBeInTheDocument()
    expect(screen.queryByTitle(/chat client$/)).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses a template whose own origin is a placeholder', async () => {
    server.chats = [{ Sneaky: 'https://{key}.evil.example/' }]
    renderEmbed('0')

    expect(await screen.findByText('This chat client is misconfigured')).toBeInTheDocument()
    expect(screen.getByText(/It was not sent\./)).toBeInTheDocument()
    expect(screen.queryByTitle(/chat client$/)).not.toBeInTheDocument()
  })
})

describe('ChatEmbedView — index handling', () => {
  it('shows a not-found state and the real directory for an out-of-range index', async () => {
    renderEmbed('42')

    expect(await screen.findByRole('heading', { name: 'Chat client not found' })).toBeInTheDocument()
    expect(screen.getByText('Nothing is configured at position 42')).toBeInTheDocument()

    const directory = within(screen.getByRole('navigation', { name: 'Configured chat clients' }))
    expect(directory.getAllByRole('link')).toHaveLength(seededChats.length)
    expect(directory.getByRole('link', { name: /Lobe Chat 官方示例/ })).toHaveAttribute(
      'href',
      '/chat/5',
    )
    expect(screen.queryByTitle(/chat client$/)).not.toBeInTheDocument()
  })

  it('moves between presets client-side, but leaves modified clicks to the browser', async () => {
    renderEmbed('42')

    const directory = within(
      await screen.findByRole('navigation', { name: 'Configured chat clients' }),
    )
    const link = directory.getByRole('link', { name: /Lobe Chat 官方示例/ })

    fireEvent.click(link, { metaKey: true })
    expect(historyPush).not.toHaveBeenCalled()

    fireEvent.click(link)
    expect(historyPush).toHaveBeenCalledWith('/chat/5')
  })

  it('treats a non-numeric segment as not found', async () => {
    renderEmbed('../admin')

    expect(await screen.findByRole('heading', { name: 'Chat client not found' })).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('shows an empty state when the operator configured nothing', async () => {
    server.chats = []
    renderEmbed('0')

    expect(await screen.findByRole('heading', { name: 'No chat clients configured' })).toBeInTheDocument()
  })
})

describe('ChatEmbedView — key states', () => {
  it('explains an account with no enabled key instead of embedding', async () => {
    server.tokens = [{ ...enabledToken, status: 2 }]
    renderEmbed(String(LOBE_INDEX))

    expect(await screen.findByRole('heading', { name: 'No enabled API key' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to API keys' })).toHaveAttribute('href', '/settings')
    expect(post).not.toHaveBeenCalled()
    expect(screen.queryByTitle(/chat client$/)).not.toBeInTheDocument()
  })

  it('surfaces a failed reveal with a retry that runs the lookup again', async () => {
    server.revealFails = true
    renderEmbed(String(LOBE_INDEX))

    expect(await screen.findByText('Could not load your API key')).toBeInTheDocument()
    expect(screen.getByText('key reveal refused')).toBeInTheDocument()

    server.revealFails = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByTitle('Lobe Chat 官方示例 chat client')).toBeInTheDocument()
  })

  it('embeds a keyless web preset without touching the key endpoints', async () => {
    server.chats = [{ Public: 'https://open.example/chat' }]
    renderEmbed('0')

    const frame = await screen.findByTitle('Public chat client')
    expect(frame).toHaveAttribute('src', 'https://open.example/chat')
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalledWith('/api/token/', expect.anything())
  })
})

describe('ChatEmbedView — status failure', () => {
  it('offers a retry when the preset list cannot be loaded', async () => {
    server.statusFails = true
    renderEmbed(String(LOBE_INDEX))

    expect(await screen.findByText('Could not load the chat clients')).toBeInTheDocument()

    server.statusFails = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => {
      expect(screen.getByTitle('Lobe Chat 官方示例 chat client')).toBeInTheDocument()
    })
  })
})
