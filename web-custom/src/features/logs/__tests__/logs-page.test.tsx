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

/** Replaces the whole envelope-unwrapping layer; every module under test reads `getJson`. */
vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  deleteJson: vi.fn(),
  getJson: vi.fn(),
  getRawJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
}))

const mockedGetJson = vi.mocked(getJson)

/** Field-for-field the shape a live `GET /api/log/self` returns for a consume row. */
function buildLog(overrides: Partial<UserLog> = {}): UserLog {
  return {
    id: 1,
    user_id: 1,
    created_at: 1787985573,
    type: 2,
    content: '',
    username: 'root',
    token_name: 'Production Router',
    model_name: 'gpt-4o-mini',
    quota: 1_250_000,
    prompt_tokens: 2048,
    completion_tokens: 512,
    use_time: 3,
    is_stream: true,
    channel: 1,
    channel_name: '',
    token_id: 1,
    group: 'default',
    ip: '',
    request_id: '202608290639337155440008268d9d6bKZoveFw',
    other:
      '{"model_ratio":2.5,"group_ratio":1,"completion_ratio":4,"frt":842,"request_path":"/v1/chat/completions"}',
    ...overrides,
  }
}

let logParams: Record<string, unknown>[] = []

function respondWith(items: UserLog[]) {
  mockedGetJson.mockImplementation(async (url, config) => {
    if (url === '/api/status') return { quota_per_unit: 500_000 }
    if (url === '/api/user/self/groups') {
      return { default: { desc: 'default', ratio: 1 }, vip: { desc: 'vip', ratio: 1 } }
    }
    if (url === '/api/log/self') {
      logParams.push({ ...(config?.params as Record<string, unknown> | undefined) })
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

/** The query string of the most recent `/api/log/self` call. */
function lastLogParams(): Record<string, unknown> {
  return logParams.at(-1) ?? {}
}

beforeEach(() => {
  logParams = []
  mockedGetJson.mockReset()
})

afterEach(cleanup)

describe('LogsPage', () => {
  it('renders the backend rows and asks for the first page', async () => {
    respondWith([buildLog()])
    renderPage()

    await screen.findAllByText('gpt-4o-mini')
    const table = screen.getByRole('table', { name: 'Request logs' })
    const row = within(table).getByText('gpt-4o-mini').closest('tr')
    expect(row).not.toBeNull()

    const cells = within(row as HTMLTableRowElement)
    expect(cells.getByText('Production Router')).toBeInTheDocument()
    expect(cells.getByText('default')).toBeInTheDocument()
    expect(cells.getByText('Usage')).toBeInTheDocument()
    // quota 1_250_000 divided by the quota_per_unit reported by /api/status
    expect(cells.getByText('$2.50')).toBeInTheDocument()
    expect(cells.getByText('2.0K / 512')).toBeInTheDocument()

    expect(lastLogParams()).toMatchObject({ p: 1, page_size: 20 })
  })

  it('marks the table busy while the first page is still loading', () => {
    respondWith([buildLog()])
    renderPage()

    expect(screen.getByRole('table', { name: 'Request logs' })).toHaveAttribute('aria-busy', 'true')
  })

  it('renders no HTTP status, route chain or region — none of them exist in the schema', async () => {
    respondWith([buildLog()])
    renderPage()

    await screen.findAllByText('gpt-4o-mini')
    expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument()
    expect(screen.queryByText('200')).not.toBeInTheDocument()
    expect(screen.queryByText(/us-east-1/)).not.toBeInTheDocument()
    expect(screen.queryByText(/openai-primary/)).not.toBeInTheDocument()
  })

  it('expands a row into the metadata the backend actually returned', async () => {
    respondWith([buildLog()])
    renderPage()

    const toggles = await screen.findAllByRole('button', { name: 'Toggle request details' })
    fireEvent.click(toggles[0])

    expect(screen.getAllByText('Request path').length).toBeGreaterThan(0)
    expect(screen.getAllByText('/v1/chat/completions').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Model ratio').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2.5').length).toBeGreaterThan(0)
    // use_time counts whole seconds; it is never rendered as milliseconds
    expect(screen.getAllByText('3s').length).toBeGreaterThan(0)
  })

  it('reports a sub-second duration honestly instead of inventing milliseconds', async () => {
    respondWith([buildLog({ other: '{}', use_time: 0 })])
    renderPage()

    const toggles = await screen.findAllByRole('button', { name: 'Toggle request details' })
    fireEvent.click(toggles[0])

    expect(screen.getAllByText('Under 1s').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('The backend recorded no extra metadata for this entry.').length,
    ).toBeGreaterThan(0)
  })

  it('drops a first-response time the backend never measured', async () => {
    respondWith([buildLog({ other: '{"frt":-1762000000000,"model_ratio":1}' })])
    renderPage()

    const toggles = await screen.findAllByRole('button', { name: 'Toggle request details' })
    fireEvent.click(toggles[0])

    expect(screen.getAllByText('Model ratio').length).toBeGreaterThan(0)
    expect(screen.queryByText('First response')).not.toBeInTheDocument()
  })

  it('flattens the op descriptor instead of dumping raw JSON under the key "op"', async () => {
    // Byte-for-byte the `other` a live type=7 row returns (admin_info/audit_info are
    // already stripped server-side by model.formatUserLogs).
    respondWith([
      buildLog({
        model_name: 'gpt-4o-mini',
        other:
          '{"login_method":"password","op":{"action":"login","params":{"method":"password"}},"user_agent":"curl/8.7.1"}',
        type: 7,
      }),
    ])
    renderPage()

    const toggles = await screen.findAllByRole('button', { name: 'Toggle request details' })
    fireEvent.click(toggles[0])

    // The action is shown under a translated label, as the raw backend identifier.
    expect(screen.getAllByText('Operation').length).toBeGreaterThan(0)
    expect(screen.getAllByText('login').length).toBeGreaterThan(0)
    // Params become their own rows, named by their leaf key — not the full path.
    expect(screen.getAllByText('method').length).toBeGreaterThan(0)
    expect(screen.queryByText('op')).not.toBeInTheDocument()
    expect(screen.queryByText('op.params.method')).not.toBeInTheDocument()
    expect(screen.queryByText(/\{"action"/)).not.toBeInTheDocument()
  })

  it('survives a row whose omitempty request_id was omitted entirely', async () => {
    // `Log.RequestId` is tagged `json:"request_id,omitempty"`, so a legacy row with an
    // empty id arrives with no such property at all.
    const { request_id: _omitted, ...withoutRequestId } = buildLog()
    respondWith([withoutRequestId as UserLog])
    renderPage()

    await screen.findAllByText('gpt-4o-mini')
    const table = screen.getByRole('table', { name: 'Request logs' })
    expect(within(table).getByText('gpt-4o-mini')).toBeInTheDocument()
    expect(screen.queryByText('undefined')).not.toBeInTheDocument()
  })

  it('sends the selected log type to the server', async () => {
    respondWith([buildLog()])
    renderPage()

    await screen.findAllByText('gpt-4o-mini')
    fireEvent.change(screen.getByRole('combobox', { name: 'Log type' }), { target: { value: '5' } })

    await waitFor(() => expect(lastLogParams()).toMatchObject({ type: 5 }))
  })

  it('binds the search box to one exact-match field at a time', async () => {
    respondWith([buildLog()])
    renderPage()

    await screen.findAllByText('gpt-4o-mini')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Request ID' }), {
      target: { value: 'req-abc' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(lastLogParams()).toMatchObject({ request_id: 'req-abc' }))
    expect(lastLogParams()).not.toHaveProperty('model_name')

    fireEvent.change(screen.getByRole('combobox', { name: 'Search field' }), {
      target: { value: 'model_name' },
    })

    await waitFor(() => expect(lastLogParams()).not.toHaveProperty('request_id'))
    expect(screen.getByRole('searchbox', { name: 'Model' })).toHaveValue('')
  })

  it('says whether an empty result is genuinely empty or filtered away', async () => {
    respondWith([])
    renderPage()

    expect(await screen.findAllByText('No request logs yet')).not.toHaveLength(0)

    fireEvent.change(screen.getByRole('combobox', { name: 'Log type' }), { target: { value: '5' } })

    expect(await screen.findAllByText('No matching request logs')).not.toHaveLength(0)
  })

  it('surfaces a retryable error instead of an empty table', async () => {
    mockedGetJson.mockImplementation(async (url) => {
      if (url === '/api/status') return { quota_per_unit: 500_000 }
      if (url === '/api/user/self/groups') return {}
      throw new Error('log database is unavailable')
    })
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Could not load request logs')).toBeInTheDocument()
    expect(within(alert).getByText('log database is unavailable')).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Request logs' })).not.toBeInTheDocument()
  })
})
