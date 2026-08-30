// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

const { FlowAnalyticsPage } = await import('@/features/dashboard-analytics/FlowAnalyticsPage')
const { MAX_DATA_RANGE_SECONDS } = await import('@/lib/api/usage-data')

/** `quota_per_unit` exactly as the seeded dev server reports it on `/api/status`. */
const statusFixture = { quota_per_unit: 500_000, enable_data_export: true }
const rootUser = { id: 1, role: 100, username: 'root' }
const plainUser = { id: 2, role: 1, username: 'member' }

/** Verbatim rows from `GET /api/data/flow/self` on the dev server. */
const selfFlowRows = [
  {
    token_id: 1,
    token_name: 'Production Router',
    use_group: 'default',
    model_name: 'gpt-4o',
    token_used: 1_018_520,
    count: 411,
    quota: 2_500_000,
  },
  {
    token_id: 2,
    token_name: 'Cost Optimized',
    use_group: 'default',
    model_name: 'gpt-4o-mini',
    token_used: 950_410,
    count: 480,
    quota: 500_000,
  },
]

/** `GET /api/data/flow` for a root caller adds user and channel to the same shape. */
const adminFlowRows = [
  {
    user_id: 1,
    username: 'root',
    token_id: 1,
    token_name: 'Production Router',
    use_group: 'default',
    channel_id: 1,
    channel_name: 'primary-pool',
    model_name: 'gpt-4o',
    token_used: 1_018_520,
    count: 411,
    quota: 2_500_000,
  },
]

type ServerState = {
  user: typeof rootUser
  selfFlow: typeof selfFlowRows
  adminFlow: typeof adminFlowRows
  /** Rows `/api/data/self` reports, which include usage the flow route filters out. */
  selfQuota: { quota: number }[]
  selfFlowFails: boolean
}

let server: ServerState
let flowParams: Record<string, unknown>[]
let requestedUrls: string[]

function envelope(data: unknown) {
  return Promise.resolve({ data: { success: true, message: '', data } })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<FlowAnalyticsPage />, { wrapper })
}

beforeEach(() => {
  flowParams = []
  requestedUrls = []
  server = {
    adminFlow: adminFlowRows,
    selfFlow: selfFlowRows,
    selfFlowFails: false,
    selfQuota: [{ quota: 3_100_000 }],
    user: rootUser,
  }
  get.mockReset()

  get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    requestedUrls.push(url)
    if (url === '/api/status') return envelope(statusFixture)
    if (url === '/api/user/self') return envelope(server.user)
    if (url === '/api/data/flow/self') {
      flowParams.push({ ...config?.params })
      if (server.selfFlowFails) return Promise.reject(new Error('the flow endpoint is unavailable'))
      return envelope(server.selfFlow)
    }
    if (url === '/api/data/flow') {
      flowParams.push({ ...config?.params })
      return envelope(server.adminFlow)
    }
    if (url === '/api/data/self') return envelope(server.selfQuota)
    if (url === '/api/data/') return envelope([])
    throw new Error(`unmocked GET ${url}`)
  })
})

afterEach(cleanup)

async function pathTable() {
  return within(await screen.findByRole('table', { name: 'Traffic paths' }))
}

/**
 * `findByRole('table')` resolves while the body is still skeleton rows, and the
 * role lookup that decides the admin controls resolves on its own schedule, so
 * assertions wait for both loading regions to clear first.
 */
async function settled() {
  await waitFor(() => {
    expect(screen.queryByText('Loading the flow breakdown')).not.toBeInTheDocument()
    expect(screen.queryByText('Loading traffic paths')).not.toBeInTheDocument()
  })
}

describe('the time range', () => {
  it('never asks for a window wider than the 30 day ceiling the self route enforces', async () => {
    renderPage()
    await settled()

    fireEvent.click(screen.getByRole('button', { name: '30d' }))

    await waitFor(() => expect(flowParams.length).toBeGreaterThan(1))
    for (const params of flowParams) {
      const span = Number(params.end_timestamp) - Number(params.start_timestamp)
      expect(span).toBeLessThanOrEqual(MAX_DATA_RANGE_SECONDS)
      expect(Number(params.start_timestamp)).toBeGreaterThan(0)
      expect(Number(params.end_timestamp)).toBeGreaterThan(0)
    }
  })

  it('sends both timestamps, which the handler rejects the request without', async () => {
    renderPage()
    await settled()

    expect(flowParams[0]).toEqual(
      expect.objectContaining({ end_timestamp: expect.any(Number), start_timestamp: expect.any(Number) }),
    )
  })
})

describe('the flow breakdown', () => {
  it('shows one column per dimension the response filled and no others', async () => {
    renderPage()
    await settled()

    const table = await pathTable()
    expect(table.getByRole('columnheader', { name: /API key/ })).toBeInTheDocument()
    expect(table.getByRole('columnheader', { name: /Group/ })).toBeInTheDocument()
    expect(table.getByRole('columnheader', { name: /Model/ })).toBeInTheDocument()
    // The self payload names neither a user nor a channel, so those never appear.
    expect(table.queryByRole('columnheader', { name: /Channel/ })).not.toBeInTheDocument()
    expect(table.queryByRole('columnheader', { name: /^User/ })).not.toBeInTheDocument()
  })

  it('converts quota with quota_per_unit from /api/status rather than a constant', async () => {
    renderPage()
    await settled()

    const table = await pathTable()
    // 2_500_000 quota over a 500_000 divisor is $5.00.
    expect(await table.findByText('$5.00')).toBeInTheDocument()
    expect(table.getByText('$1.00')).toBeInTheDocument()
  })

  it('filters every other dimension when a node is selected, and can be cleared', async () => {
    renderPage()
    await settled()

    const keyFilter = screen.getByLabelText('Filter by API key')
    fireEvent.change(keyFilter, { target: { value: 'token:1' } })

    await waitFor(async () => {
      const table = await pathTable()
      expect(table.queryByText('Cost Optimized')).not.toBeInTheDocument()
    })
    expect(screen.getByText('1 filters applied')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
    const restored = await pathTable()
    expect(await restored.findByText('Cost Optimized')).toBeInTheDocument()
  })

  it('narrows the totals with the filter so the cards and the table agree', async () => {
    renderPage()
    await settled()

    // Unfiltered: both rows, 2_500_000 + 500_000 quota over a 500_000 divisor.
    const totals = () => within(screen.getByRole('region', { name: 'Range totals' }))
    expect(totals().getByText('$6.00')).toBeInTheDocument()
    expect(totals().getByText('2')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Filter by API key'), { target: { value: 'token:1' } })

    // Filtered to the first key the cards follow the table down to one path...
    await waitFor(() => expect(totals().getByText('$5.00')).toBeInTheDocument())
    expect(totals().getByText('1')).toBeInTheDocument()
    // ...and the ungrouped-spend note is withdrawn, because the endpoint it is
    // compared against knows nothing about the stage filters.
    expect(screen.queryByText(/of spend in this range carries none/)).not.toBeInTheDocument()
  })

  it('discloses the spend the flow endpoint leaves out because it has no group', async () => {
    renderPage()

    // /api/data/self reports 3_100_000; the flow rows add up to 3_000_000.
    expect(await screen.findByText(/\$0\.20 of spend in this range carries none/)).toBeInTheDocument()
  })
})

describe('empty and error states', () => {
  it('renders a real empty state instead of a blank panel', async () => {
    server.selfFlow = []
    server.selfQuota = []
    renderPage()
    await settled()

    expect(await screen.findByText('No traffic in this range')).toBeInTheDocument()
    const table = await pathTable()
    expect(table.getByText('No paths to show')).toBeInTheDocument()
  })

  it('offers a retry and suppresses the panels when the endpoint fails', async () => {
    server.selfFlowFails = true
    renderPage()

    expect(await screen.findByText('The traffic flow could not be loaded')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Traffic paths' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('the administrator scope', () => {
  it('is hidden for a non-admin, who only ever reads the self route', async () => {
    server.user = plainUser
    renderPage()
    await settled()

    expect(await screen.findByText('This is your own traffic')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Traffic scope' })).not.toBeInTheDocument()
    expect(requestedUrls).not.toContain('/api/data/flow')
  })

  it('switches an admin to the all-users route and reveals its extra dimensions', async () => {
    renderPage()
    await settled()
    expect(requestedUrls).not.toContain('/api/data/flow')

    fireEvent.click(await screen.findByRole('button', { name: 'Everyone' }))

    await waitFor(() => expect(requestedUrls).toContain('/api/data/flow'))
    const table = await pathTable()
    expect(await table.findByRole('columnheader', { name: /Channel/ })).toBeInTheDocument()
    expect(table.getByText('primary-pool')).toBeInTheDocument()
  })

  it('warns that the username filter is an exact match when it matches nothing', async () => {
    server.adminFlow = []
    renderPage()
    await settled()

    fireEvent.click(await screen.findByRole('button', { name: 'Everyone' }))
    fireEvent.change(await screen.findByLabelText('Filter by exact username'), {
      target: { value: 'roo' },
    })

    expect(await screen.findByText('No traffic for that username')).toBeInTheDocument()
    await waitFor(() =>
      expect(flowParams.some((params) => params.username === 'roo')).toBe(true),
    )
  })
})
