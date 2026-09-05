// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LogsPage } from '@/features/logs/LogsPage'
import { getJson } from '@/lib/api/client'
import type { UserLog } from '@/lib/api/logs'

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  deleteJson: vi.fn(),
  getJson: vi.fn(),
  getRawJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
}))

const mockedGetJson = vi.mocked(getJson)

/**
 * The `/api/log/` copy of a consume row, byte-for-byte off the dev server: a real
 * primary key, a joined `channel_name`, and an `other` that still holds the three
 * roots `model.formatUserLogs` deletes for `/api/log/self`.
 */
function buildAdminLog(overrides: Partial<UserLog> = {}): UserLog {
  return {
    id: 1001,
    user_id: 2,
    created_at: 1788578091,
    type: 2,
    content: 'Model call gpt-4o-mini',
    username: 'probeuser',
    token_name: 'probe-key',
    model_name: 'gpt-4o-mini',
    quota: 1250,
    prompt_tokens: 2048,
    completion_tokens: 512,
    use_time: 3,
    is_stream: true,
    channel: 1,
    channel_name: 'local-test',
    token_id: 1,
    group: 'default',
    ip: '127.0.0.1',
    request_id: 'probe-req-root-0001',
    other:
      '{"model_ratio":2.5,"group_ratio":1,"completion_ratio":4,"admin_info":{"admin_id":1,"admin_username":"root"},"audit_info":{"method":"POST","route":"/v1/chat/completions"},"stream_status":{"status":"error","end_reason":"aborted"}}',
    ...overrides,
  }
}

/** The same row as `/api/log/self` returns it: display index, blank name, stripped `other`. */
function buildSelfLog(overrides: Partial<UserLog> = {}): UserLog {
  return buildAdminLog({
    id: 1,
    channel_name: '',
    other: '{"model_ratio":2.5,"group_ratio":1,"completion_ratio":4}',
    ...overrides,
  })
}

type Call = { url: string; params: Record<string, unknown> }

let calls: Call[] = []

function respond(options: { role?: number; self?: UserLog[]; all?: UserLog[] } = {}) {
  const { role = 1, self = [buildSelfLog()], all = [buildAdminLog()] } = options
  mockedGetJson.mockImplementation(async (url, config) => {
    const params = { ...(config?.params as Record<string, unknown> | undefined) }
    if (url === '/api/status') return { quota_per_unit: 500_000 }
    if (url === '/api/user/self') return { id: 1, username: 'root', role }
    if (url === '/api/user/self/groups') return { default: { desc: 'default', ratio: 1 } }
    if (url === '/api/log/self/stat' || url === '/api/log/stat') {
      calls.push({ url, params })
      return { quota: 1250, rpm: 0, tpm: 0 }
    }
    if (url === '/api/log/self' || url === '/api/log/') {
      calls.push({ url, params })
      const items = url === '/api/log/' ? all : self
      return { page: 1, page_size: 20, total: items.length, items }
    }
    throw new Error(`unexpected url ${url}`)
  })
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  })
  const wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
  )
  return render(<LogsPage />, { wrapper })
}

/** The most recent listing call — the stat calls are filtered out. */
function lastListCall(): Call {
  const listCalls = calls.filter((call) => call.url === '/api/log/self' || call.url === '/api/log/')
  return listCalls[listCalls.length - 1] ?? { url: '', params: {} }
}

function lastStatCall(): Call {
  const statCalls = calls.filter(
    (call) => call.url === '/api/log/self/stat' || call.url === '/api/log/stat',
  )
  return statCalls[statCalls.length - 1] ?? { url: '', params: {} }
}

async function switchToEveryone() {
  fireEvent.click(await screen.findByRole('button', { name: 'All users' }))
  await waitFor(() => expect(lastListCall().url).toBe('/api/log/'))
}

beforeEach(() => {
  calls = []
  mockedGetJson.mockReset()
})

afterEach(cleanup)

describe('scope gating', () => {
  it('offers no scope switch below role 10 and stays on the self endpoint', async () => {
    respond({ role: 1 })
    renderPage()

    await waitFor(() => expect(lastListCall().url).toBe('/api/log/self'))
    // The server answers 403 AUTH_INSUFFICIENT_PRIVILEGE on /api/log/ for role 1, so
    // the control is absent rather than present-and-refused.
    expect(screen.queryByRole('button', { name: 'All users' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'My logs' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Username' })).not.toBeInTheDocument()
  })

  it('lets an admin switch to the all-users listing and back', async () => {
    respond({ role: 10 })
    renderPage()

    await waitFor(() => expect(lastListCall().url).toBe('/api/log/self'))
    await switchToEveryone()

    fireEvent.click(screen.getByRole('button', { name: 'My logs' }))
    await waitFor(() => expect(lastListCall().url).toBe('/api/log/self'))
  })

  it('moves the stats strip onto the admin stat route with the scope', async () => {
    respond({ role: 10 })
    renderPage()

    await waitFor(() => expect(lastStatCall().url).toBe('/api/log/self/stat'))
    await switchToEveryone()
    await waitFor(() => expect(lastStatCall().url).toBe('/api/log/stat'))
  })
})

describe('columns only the admin listing fills', () => {
  it('adds user, channel and channel name in the everyone scope', async () => {
    respond({ role: 10 })
    renderPage()

    await switchToEveryone()
    const table = await screen.findByRole('table', { name: 'Request logs' })
    await waitFor(() => expect(within(table).getAllByText('probeuser')).not.toHaveLength(0))

    expect(within(table).getByRole('columnheader', { name: 'Username' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Channel' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Channel name' })).toBeInTheDocument()
    expect(within(table).getAllByText('local-test')).not.toHaveLength(0)
  })

  it('drops those columns again when the admin returns to their own logs', async () => {
    respond({ role: 10 })
    renderPage()

    await switchToEveryone()
    await screen.findByRole('columnheader', { name: 'Channel name' })

    fireEvent.click(screen.getByRole('button', { name: 'My logs' }))
    await waitFor(() =>
      expect(screen.queryByRole('columnheader', { name: 'Channel name' })).not.toBeInTheDocument(),
    )
    // `channel_name` is blanked by model.formatUserLogs for /self, so the column would
    // be an always-empty one rather than a withheld value.
    expect(screen.queryByRole('columnheader', { name: 'Username' })).not.toBeInTheDocument()
  })
})

describe('filters only the admin listing parses', () => {
  it('sends username as its own exact-match parameter', async () => {
    respond({ role: 10 })
    renderPage()

    await switchToEveryone()
    fireEvent.change(screen.getByRole('combobox', { name: 'Search field' }), {
      target: { value: 'username' },
    })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Username' }), {
      target: { value: 'probeuser' },
    })

    await waitFor(() => expect(lastListCall().params).toMatchObject({ username: 'probeuser' }))
    expect(lastListCall().params).not.toHaveProperty('request_id')
  })

  it('does not offer the username field while the scope is mine', async () => {
    respond({ role: 10 })
    renderPage()

    await waitFor(() => expect(lastListCall().url).toBe('/api/log/self'))
    const options = within(screen.getByRole('combobox', { name: 'Search field' })).getAllByRole(
      'option',
    )
    expect(options.map((option) => option.textContent)).not.toContain('Username')
  })

  it('drops the username filter when the scope narrows back to mine', async () => {
    respond({ role: 10 })
    renderPage()

    await switchToEveryone()
    fireEvent.change(screen.getByRole('combobox', { name: 'Search field' }), {
      target: { value: 'username' },
    })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Username' }), {
      target: { value: 'probeuser' },
    })
    await waitFor(() => expect(lastListCall().params).toMatchObject({ username: 'probeuser' }))

    fireEvent.click(screen.getByRole('button', { name: 'My logs' }))
    await waitFor(() => expect(lastListCall().url).toBe('/api/log/self'))
    // GET /api/log/self ignores username entirely — verified live — so keeping it would
    // leave a filled-in control that silently changes nothing.
    expect(lastListCall().params).not.toHaveProperty('username')
  })

  it('sends channel as a number and ignores a value the server would parse as no filter', async () => {
    respond({ role: 10 })
    renderPage()

    await switchToEveryone()
    const channelBox = screen.getByRole('searchbox', { name: 'Channel ID' })

    fireEvent.change(channelBox, { target: { value: 'abc' } })
    await waitFor(() => expect(screen.queryByRole('searchbox', { name: 'Channel ID' })).toHaveValue('abc'))
    expect(lastListCall().params).not.toHaveProperty('channel')

    fireEvent.change(channelBox, { target: { value: '7' } })
    await waitFor(() => expect(lastListCall().params).toMatchObject({ channel: 7 }))
  })

  it('offers no channel filter in the mine scope', async () => {
    respond({ role: 10 })
    renderPage()

    await waitFor(() => expect(lastListCall().url).toBe('/api/log/self'))
    expect(screen.queryByRole('searchbox', { name: 'Channel ID' })).not.toBeInTheDocument()
  })
})

describe('row detail', () => {
  it('surfaces the admin-only half of `other` under its raw backend paths', async () => {
    respond({ role: 10 })
    renderPage()

    await switchToEveryone()
    const toggles = await screen.findAllByRole('button', { name: 'Toggle request details' })
    fireEvent.click(toggles[0])

    expect(screen.getAllByText('Admin-only metadata').length).toBeGreaterThan(0)
    expect(screen.getAllByText('admin_info.admin_username').length).toBeGreaterThan(0)
    expect(screen.getAllByText('audit_info.route').length).toBeGreaterThan(0)
    expect(screen.getAllByText('stream_status.end_reason').length).toBeGreaterThan(0)
    // The billing breakdown is untouched by the split.
    expect(screen.getAllByText('Model ratio').length).toBeGreaterThan(0)
  })

  it('shows no admin section for a row whose payload was stripped', async () => {
    respond({ role: 10 })
    renderPage()

    await waitFor(() => expect(lastListCall().url).toBe('/api/log/self'))
    const toggles = await screen.findAllByRole('button', { name: 'Toggle request details' })
    fireEvent.click(toggles[0])

    expect(screen.queryByText('Admin-only metadata')).not.toBeInTheDocument()
    expect(screen.getAllByText('Model ratio').length).toBeGreaterThan(0)
  })

  it('shows the channel id to a non-admin, because /api/log/self does carry it', async () => {
    respond({ role: 1 })
    renderPage()

    await waitFor(() => expect(lastListCall().url).toBe('/api/log/self'))
    const toggles = await screen.findAllByRole('button', { name: 'Toggle request details' })
    fireEvent.click(toggles[0])

    // channel = 1 survives model.formatUserLogs; only channel_name is blanked, so the
    // id is shown without a name rather than hidden.
    expect(screen.getAllByText('#1').length).toBeGreaterThan(0)
  })

  it('names the channel once the admin payload joins it', async () => {
    respond({ role: 10 })
    renderPage()

    await switchToEveryone()
    const toggles = await screen.findAllByRole('button', { name: 'Toggle request details' })
    fireEvent.click(toggles[0])

    expect(screen.getAllByText('local-test · #1').length).toBeGreaterThan(0)
  })

  it('hides the channel row entirely for a log that never touched a channel', async () => {
    respond({ role: 1, self: [buildSelfLog({ channel: 0, type: 7 })] })
    renderPage()

    await waitFor(() => expect(lastListCall().url).toBe('/api/log/self'))
    const toggles = await screen.findAllByRole('button', { name: 'Toggle request details' })
    fireEvent.click(toggles[0])

    expect(screen.queryByText('#0')).not.toBeInTheDocument()
  })
})

describe('empty and error states carry the scope', () => {
  it('says the deployment is empty rather than the account when scoped to everyone', async () => {
    respond({ role: 10, self: [], all: [] })
    renderPage()

    expect(await screen.findAllByText('Requests you send through the API appear here.')).not.toHaveLength(0)

    fireEvent.click(await screen.findByRole('button', { name: 'All users' }))

    expect(
      await screen.findAllByText(
        'Nothing has been logged on this deployment yet. Requests from every account appear here.',
      ),
    ).not.toHaveLength(0)
  })

  it('surfaces a retryable error when the admin listing fails', async () => {
    mockedGetJson.mockImplementation(async (url) => {
      if (url === '/api/status') return { quota_per_unit: 500_000 }
      if (url === '/api/user/self') return { id: 1, username: 'root', role: 10 }
      if (url === '/api/user/self/groups') return {}
      if (url === '/api/log/self/stat' || url === '/api/log/stat') return { quota: 0, rpm: 0, tpm: 0 }
      if (url === '/api/log/self') return { page: 1, page_size: 20, total: 0, items: [] }
      throw new Error('admin log listing exploded')
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'All users' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('admin log listing exploded')).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
