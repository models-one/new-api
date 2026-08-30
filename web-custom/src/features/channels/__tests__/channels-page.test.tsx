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

vi.mock('@/lib/http-client', () => ({ api: { delete: del, get, post, put } }))

import type { Channel } from '@/features/channels/api'

const { ChannelsPage } = await import('@/features/channels/ChannelsPage')
const { CHANNEL_ADMIN_ROLE } = await import('@/features/channels/access')

/** The five channel actions, exactly as `GET /api/user/self` returns them for root. */
const rootGrants = {
  operate: true,
  read: true,
  secret_view: true,
  sensitive_write: true,
  write: true,
}

/** The admin baseline from service/authz/resources_channel.go: no sensitive_write. */
const adminGrants = { operate: true, read: true, write: true }

function viewer(role: number, channel: Record<string, boolean> | undefined) {
  return {
    id: 1,
    permissions: {
      admin_permissions: channel === undefined ? {} : { channel },
      sidebar_modules: {},
      sidebar_settings: false,
    },
    role,
    username: 'root',
  }
}

/** A verbatim row from `GET /api/channel/?p=1&page_size=10` on the dev server. */
const openAiRow: Channel = {
  auto_ban: 1,
  balance: 0,
  balance_updated_time: 0,
  base_url: 'http://127.0.0.1:9',
  channel_info: {
    is_multi_key: false,
    multi_key_mode: '',
    multi_key_polling_index: 0,
    multi_key_size: 0,
    multi_key_status_list: null,
  },
  created_time: 1_788_052_007,
  group: 'default',
  header_override: null,
  id: 3,
  key: '',
  model_mapping: '{"a":"b"}',
  models: 'gpt-4o-mini,gpt-4o',
  name: 'probe-openai',
  openai_organization: null,
  other: '',
  other_info: '{"status_reason":"manual batch operation","status_time":1788052084}',
  param_override: null,
  priority: 3,
  remark: 'probe',
  response_time: 0,
  setting: '',
  settings: '',
  status: 1,
  status_code_mapping: '',
  tag: 'probeTag',
  test_model: null,
  test_time: 0,
  type: 1,
  used_quota: 0,
  weight: 2,
}

/** A Gemini row: balance queries are NOT implemented for type 24 server-side. */
const geminiRow: Channel = {
  ...openAiRow,
  base_url: '',
  id: 7,
  models: 'gemini-2.0-flash',
  name: 'probe-gemini',
  other_info: '',
  remark: null,
  tag: null,
  type: 24,
}

type ServerState = {
  viewer: ReturnType<typeof viewer>
  items: Channel[]
  total: number
  groups: string[]
  listFails?: boolean
  selfFails?: boolean
}

let server: ServerState

function envelope(data: unknown) {
  return Promise.resolve({ data: { data, message: '', success: true } })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<ChannelsPage />, { wrapper })
}

/**
 * The page renders the desktop table and the mobile card list side by side and hides one
 * with a Tailwind breakpoint, so both are in the DOM under happy-dom. Every row assertion
 * is scoped to the table to keep the duplicates apart.
 */
async function channelTable() {
  return within(await screen.findByRole('table', { name: 'Channels' }))
}

async function channelRow(name: string) {
  const table = await channelTable()
  const cell = await table.findByText(name)
  return within(cell.closest('tr') as HTMLElement)
}

async function rowMenu(name: string) {
  const cells = await channelRow(name)
  fireEvent.click(cells.getByRole('button', { name: `More actions for ${name}` }))
  return within(await screen.findByRole('menu'))
}

beforeEach(() => {
  server = {
    groups: ['default', 'vip', 'svip'],
    items: [],
    total: 0,
    viewer: viewer(100, rootGrants),
  }
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/status') return envelope({ quota_per_unit: 500_000 })
    if (url === '/api/user/self') {
      if (server.selfFails) return Promise.reject(new Error('self is unavailable'))
      return envelope(server.viewer)
    }
    if (url === '/api/group/') return envelope(server.groups)
    if (url === '/api/channel/models_enabled') return envelope(['gpt-4o-mini'])
    if (url === '/api/channel/' || url === '/api/channel/search') {
      if (server.listFails) return Promise.reject(new Error('the channel list is unavailable'))
      return envelope({
        items: server.items,
        page: 1,
        page_size: 20,
        total: server.total,
        type_counts: { 1: 1, 24: 1 },
      })
    }
    if (url.startsWith('/api/channel/test/')) {
      return Promise.resolve({
        data: {
          error_code: 'do_request_failed',
          message: 'do request failed: upstream error: do request failed',
          success: false,
          time: 0,
        },
      })
    }
    if (url.startsWith('/api/channel/update_balance/')) {
      return Promise.resolve({ data: { balance: 12.5, message: '', success: true } })
    }
    if (url.startsWith('/api/channel/')) {
      const id = Number(url.slice('/api/channel/'.length))
      const match = server.items.find((item) => item.id === id)
      if (match === undefined) {
        return Promise.resolve({ data: { message: 'record not found', success: false } })
      }
      return envelope(match)
    }
    throw new Error(`unmocked GET ${url}`)
  })
})

afterEach(cleanup)

describe('the administrator guard', () => {
  it('gates on the AdminAuth threshold the channel route group enforces, not root', () => {
    expect(CHANNEL_ADMIN_ROLE).toBe(10)
  })

  it('refuses a non-admin and never calls a channel endpoint', async () => {
    server.viewer = viewer(1, undefined)
    renderPage()

    expect(await screen.findByText('Administrator access required')).toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/api/channel/', expect.anything())
  })

  it('reports a failed role lookup instead of claiming the account lacks the role', async () => {
    server.selfFails = true
    renderPage()

    expect(await screen.findByText('Could not confirm your permissions')).toBeInTheDocument()
    expect(screen.queryByText('Administrator access required')).not.toBeInTheDocument()
  })

  it('explains a missing channel:read grant instead of firing a request that would 403', async () => {
    server.viewer = viewer(10, { operate: true, write: true })
    renderPage()

    expect(await screen.findByText('The channel:read grant is missing')).toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/api/channel/', expect.anything())
  })
})

describe('the per-action grants', () => {
  it('disables creation for an admin without channel:sensitive_write', async () => {
    server.viewer = viewer(10, adminGrants)
    renderPage()
    await channelTable()

    expect(screen.getByRole('button', { name: 'New channel' })).toBeDisabled()
  })

  it('leaves creation available to root', async () => {
    renderPage()
    await channelTable()

    expect(screen.getByRole('button', { name: 'New channel' })).toBeEnabled()
  })

  it('disables duplicate and delete for an admin without channel:sensitive_write', async () => {
    server.viewer = viewer(10, adminGrants)
    server.items = [openAiRow]
    server.total = 1
    renderPage()

    const menu = await rowMenu('probe-openai')
    expect(menu.getByRole('menuitem', { name: /Duplicate/ })).toHaveAttribute('data-disabled')
    expect(menu.getByRole('menuitem', { name: /Delete permanently/ })).toHaveAttribute('data-disabled')
    // operate is granted, so enable/disable stay available.
    expect(menu.getByRole('menuitem', { name: 'Disable' })).not.toHaveAttribute('data-disabled')
  })

  it('disables the test action for an admin without channel:operate', async () => {
    server.viewer = viewer(10, { read: true, write: true })
    server.items = [openAiRow]
    server.total = 1
    renderPage()

    const cells = await channelRow('probe-openai')
    expect(
      cells.getByRole('button', { name: /Test probe-openai — needs the channel:operate grant/ }),
    ).toBeDisabled()
  })
})

describe('the channel table', () => {
  it('shows a real empty state, which is what a fresh deployment renders', async () => {
    renderPage()

    const table = await channelTable()
    expect(await table.findByText('No channels yet')).toBeInTheDocument()
  })

  it('offers a retry rather than an empty table when the list request fails', async () => {
    server.listFails = true
    renderPage()

    expect(await screen.findByText('Could not load the channels')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('says a balance is not supported rather than showing $0.00 for a provider without one', async () => {
    server.items = [openAiRow, geminiRow]
    server.total = 2
    renderPage()

    // Type 1 is implemented in controller.updateChannelBalance but never checked here.
    const openai = await channelRow('probe-openai')
    expect(openai.getByText('Never checked')).toBeInTheDocument()

    // Type 24 has no implementation at all; the server would answer "尚未实现".
    const gemini = await channelRow('probe-gemini')
    expect(gemini.getByText('Not supported')).toBeInTheDocument()
    expect(
      gemini.getByRole('button', { name: 'Balance queries are not implemented for Gemini' }),
    ).toBeDisabled()
  })

  it('separates "never tested" from a recorded response time', async () => {
    server.items = [openAiRow]
    server.total = 1
    renderPage()

    const cells = await channelRow('probe-openai')
    expect(cells.getByText('Never tested')).toBeInTheDocument()
  })
})

describe('testing a channel', () => {
  it('surfaces the upstream error verbatim rather than a generic failure', async () => {
    server.items = [openAiRow]
    server.total = 1
    renderPage()

    const cells = await channelRow('probe-openai')
    fireEvent.click(cells.getByRole('button', { name: 'Send a live test request to probe-openai' }))

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/api/channel/test/3', expect.anything())
    })

    const after = await channelRow('probe-openai')
    // The server's own error_code labels the badge, and its message is the description.
    expect(await after.findByText('do_request_failed')).toBeInTheDocument()
    expect(
      after.getByTitle('do request failed: upstream error: do request failed'),
    ).toBeInTheDocument()
  })
})

describe('the destructive gates', () => {
  it('makes a single delete type the channel name before it will fire', async () => {
    server.items = [openAiRow]
    server.total = 1
    renderPage()

    const menu = await rowMenu('probe-openai')
    fireEvent.click(menu.getByRole('menuitem', { name: /Delete permanently/ }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Delete this channel permanently?')).toBeInTheDocument()

    const confirm = dialog.getByRole('button', { name: 'Delete channel' })
    expect(confirm).toBeDisabled()

    fireEvent.change(dialog.getByRole('textbox'), { target: { value: 'probe-openai' } })
    expect(confirm).toBeEnabled()

    fireEvent.click(confirm)
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/api/channel/3', expect.anything())
    })
  })

  it('names the count before a batch delete and posts the ids the server expects', async () => {
    server.items = [openAiRow, geminiRow]
    server.total = 2
    post.mockResolvedValue({ data: { data: 2, message: '', success: true } })
    renderPage()

    await channelRow('probe-openai')
    const table = await channelTable()
    fireEvent.click(table.getByRole('checkbox', { name: 'Select every channel on this page' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Delete 2 channels permanently?')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Delete 2 channels' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/api/channel/batch', { ids: [3, 7] }, expect.anything())
    })
    expect(await screen.findByText('Deleted 2 of 2 selected channels')).toBeInTheDocument()
  })

  it('reports a partial batch disable honestly instead of claiming success', async () => {
    server.items = [openAiRow, geminiRow]
    server.total = 2
    // The server reports how many rows actually moved; one was already disabled.
    post.mockResolvedValue({ data: { data: 1, message: '', success: true } })
    renderPage()

    await channelRow('probe-openai')
    const table = await channelTable()
    fireEvent.click(table.getByRole('checkbox', { name: 'Select every channel on this page' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Disable' }))

    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: 'Disable 2 channels' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/channel/status/batch',
        { ids: [3, 7], status: 2 },
        expect.anything(),
      )
    })
    expect(await screen.findByText('Disabled 1 of 2 selected channels')).toBeInTheDocument()
    expect(
      screen.getByText('The rest were already in that state, or no longer exist.'),
    ).toBeInTheDocument()
  })

  it('reports each upstream failure by name after a batch test', async () => {
    server.items = [openAiRow, geminiRow]
    server.total = 2
    renderPage()

    await channelRow('probe-openai')
    const table = await channelTable()
    fireEvent.click(table.getByRole('checkbox', { name: 'Select every channel on this page' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Test' }))

    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: 'Test 2 channels' }))

    // Both tests fail against the mocked upstream, and each failure is listed with the
    // server's own message rather than collapsed into a single "some failed".
    expect(await screen.findByText('0 of 2 selected channels answered')).toBeInTheDocument()
    const message = 'do request failed: upstream error: do request failed'
    expect(
      screen.getByText(`probe-openai: ${message}`),
    ).toBeInTheDocument()
    expect(
      screen.getByText(`probe-gemini: ${message}`),
    ).toBeInTheDocument()
  })

  it('confirms a batch test before spending upstream credit', async () => {
    server.items = [openAiRow]
    server.total = 1
    renderPage()

    await channelRow('probe-openai')
    const table = await channelTable()
    fireEvent.click(table.getByRole('checkbox', { name: 'Select every channel on this page' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Test' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Send a live request to 1 channels?')).toBeInTheDocument()
    // Nothing has been sent yet: the confirmation stands between the click and the call.
    expect(get).not.toHaveBeenCalledWith('/api/channel/test/3', expect.anything())
  })
})

describe('the editor', () => {
  it('says a blank key keeps the stored one and never pre-fills a key', async () => {
    server.items = [openAiRow]
    server.total = 1
    renderPage()

    const cells = await channelRow('probe-openai')
    fireEvent.click(cells.getByRole('button', { name: 'Edit probe-openai' }))

    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(await dialog.findByRole('tab', { name: 'Credentials' }))

    const keyField = dialog.getByLabelText(/^Replacement key/)
    expect(keyField).toHaveValue('')
    expect(
      dialog.getByText(/Leave blank to keep the stored key/),
    ).toBeInTheDocument()
  })

  it('sends a routing-only edit without any sensitive field, so channel:write is enough', async () => {
    server.items = [openAiRow]
    server.total = 1
    put.mockResolvedValue({ data: { data: openAiRow, message: '', success: true } })
    renderPage()

    const cells = await channelRow('probe-openai')
    fireEvent.click(cells.getByRole('button', { name: 'Edit probe-openai' }))

    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(await dialog.findByLabelText(/^Name/), { target: { value: 'renamed' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(put).toHaveBeenCalled())
    const body = put.mock.calls[0][1] as Record<string, unknown>
    expect(body.name).toBe('renamed')
    expect(body.id).toBe(3)
    expect(Object.keys(body)).not.toContain('key')
    expect(Object.keys(body)).not.toContain('status')
    expect(Object.keys(body)).not.toContain('base_url')
    expect(Object.keys(body)).not.toContain('type')
  })

  it('blocks a malformed model mapping before it reaches the server', async () => {
    server.items = [openAiRow]
    server.total = 1
    renderPage()

    const cells = await channelRow('probe-openai')
    fireEvent.click(cells.getByRole('button', { name: 'Edit probe-openai' }))

    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(await dialog.findByRole('tab', { name: 'Models' }))
    fireEvent.change(dialog.getByLabelText(/^Model mapping/), { target: { value: '{oops' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save changes' }))

    expect(await dialog.findByText(/Not valid JSON/)).toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()
  })

  it('asks Azure for the fields Azure needs and nothing else', async () => {
    renderPage()
    await channelTable()

    fireEvent.click(screen.getByRole('button', { name: 'New channel' }))
    const dialog = within(await screen.findByRole('dialog'))

    fireEvent.change(dialog.getByLabelText(/^Provider type/), { target: { value: '3' } })
    fireEvent.click(await dialog.findByRole('tab', { name: 'Credentials' }))

    expect(dialog.getByLabelText(/^Azure OpenAI endpoint/)).toBeInTheDocument()
    // `other` is pre-filled with the default api-version rather than left blank.
    expect(dialog.getByLabelText(/^Default API version/)).toHaveValue('2024-12-01-preview')
    expect(dialog.getByLabelText(/^Responses API version/)).toBeInTheDocument()
    // The OpenAI-only organisation field must not follow the type change.
    expect(dialog.queryByLabelText(/^OpenAI organisation/)).not.toBeInTheDocument()
  })

  it('asks AWS for a key format and nothing Azure-shaped', async () => {
    renderPage()
    await channelTable()

    fireEvent.click(screen.getByRole('button', { name: 'New channel' }))
    const dialog = within(await screen.findByRole('dialog'))

    fireEvent.change(dialog.getByLabelText(/^Provider type/), { target: { value: '33' } })
    fireEvent.click(await dialog.findByRole('tab', { name: 'Credentials' }))

    expect(dialog.getByLabelText(/^AWS key format/)).toBeInTheDocument()
    expect(dialog.queryByLabelText(/^Default API version/)).not.toBeInTheDocument()
  })

  it('posts the create body controller.AddChannel binds', async () => {
    post.mockResolvedValue({ data: { message: '', success: true } })
    renderPage()
    await channelTable()

    fireEvent.click(screen.getByRole('button', { name: 'New channel' }))
    const dialog = within(await screen.findByRole('dialog'))

    fireEvent.change(dialog.getByLabelText(/^Name/), { target: { value: 'new-openai' } })
    fireEvent.click(await dialog.findByRole('tab', { name: 'Credentials' }))
    fireEvent.change(dialog.getByLabelText(/^Key/), { target: { value: 'sk-abcdefghij' } })
    fireEvent.click(await dialog.findByRole('tab', { name: 'Models' }))
    fireEvent.change(dialog.getByRole('textbox', { name: /^Models/ }), { target: { value: 'gpt-4o-mini' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Create channel' }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    const [url, body] = post.mock.calls[0] as [string, Record<string, unknown>]
    expect(url).toBe('/api/channel/')
    expect(body.mode).toBe('single')
    const channel = body.channel as Record<string, unknown>
    expect(channel.name).toBe('new-openai')
    expect(channel.key).toBe('sk-abcdefghij')
    expect(channel.models).toBe('gpt-4o-mini')
    expect(channel.group).toBe('default')
    expect(Object.keys(channel)).not.toContain('status')
  })

  it('refuses to create without a key, which validateChannel would reject anyway', async () => {
    renderPage()
    await channelTable()

    fireEvent.click(screen.getByRole('button', { name: 'New channel' }))
    const dialog = within(await screen.findByRole('dialog'))

    fireEvent.change(dialog.getByLabelText(/^Name/), { target: { value: 'no-key' } })
    fireEvent.click(await dialog.findByRole('tab', { name: 'Models' }))
    fireEvent.change(dialog.getByRole('textbox', { name: /^Models/ }), { target: { value: 'gpt-4o-mini' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Create channel' }))

    expect(
      await dialog.findByText('A key is required when the channel is created.'),
    ).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })
})
