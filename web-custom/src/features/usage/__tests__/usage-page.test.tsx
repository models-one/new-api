// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UsagePage } from '@/features/usage/UsagePage'
import { recentBillingMonths, resolveBillingWindow } from '@/features/usage/billing-month'
import type { FlowQuotaRow } from '@/features/usage/flow'
import type { QuotaDataPoint } from '@/lib/api/usage-data'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))

vi.mock('@/lib/http-client', () => ({
  api: {
    get: (url: string, config?: unknown) => apiGet(url, config),
    post: () => new Promise(() => {}),
    put: () => new Promise(() => {}),
    delete: () => new Promise(() => {}),
  },
}))

/** Mid-month so the current month has a projection but is nowhere near the 30 day cap. */
const NOW = new Date(2026, 7, 20, 10, 30, 0)

function currentWindow() {
  return resolveBillingWindow(recentBillingMonths(NOW, 1)[0], NOW)
}

/** Only the fields `/api/data/self` actually fills for a non-admin caller. */
function point(overrides: Partial<QuotaDataPoint>): QuotaDataPoint {
  return {
    id: 0,
    user_id: 1,
    username: 'root',
    model_name: 'gpt-4o',
    created_at: 1_787_900_400,
    use_group: '',
    token_id: 0,
    channel_id: 0,
    node_name: '',
    token_used: 0,
    count: 0,
    quota: 0,
    ...overrides,
  }
}

const usagePoints: QuotaDataPoint[] = [
  point({ count: 900, model_name: 'gpt-4o', quota: 30_000_000, token_used: 1_200_000 }),
  point({ count: 300, model_name: 'claude-sonnet-4', quota: 10_000_000, token_used: 800_000 }),
]

/**
 * Live `/api/data/flow/self` rows: `token_id` and `token_name` are `omitempty`, so a
 * deleted key arrives with an id and no name, and usage the server cannot tie to a
 * key arrives with neither.
 */
const flowRows: FlowQuotaRow[] = [
  {
    token_id: 1,
    token_name: 'Production Router',
    use_group: 'default',
    model_name: 'gpt-4o',
    token_used: 900_000,
    count: 700,
    quota: 24_000_000,
  },
  {
    token_id: 2,
    use_group: 'default',
    model_name: 'gpt-4o',
    token_used: 300_000,
    count: 200,
    quota: 8_000_000,
  },
  {
    use_group: 'default',
    model_name: 'orphan-model',
    token_used: 100_000,
    count: 60,
    quota: 5_000_000,
  },
]

const topUpPage = {
  page: 1,
  page_size: 10,
  total: 2,
  items: [
    {
      id: 2,
      user_id: 1,
      amount: 100,
      money: 98.5,
      trade_no: 'TN17872080531',
      create_time: 1_787_208_053,
      complete_time: 1_787_208_173,
      status: 'success',
    },
    {
      id: 1,
      user_id: 1,
      amount: 20,
      money: 20,
      trade_no: 'TN17863440532',
      create_time: 1_786_344_053,
      complete_time: 0,
      status: 'pending',
    },
  ],
}

function seedEverything(client: QueryClient) {
  const window = currentWindow()
  client.setQueryData(['server-status'], { enable_data_export: true, quota_per_unit: 500_000 })
  client.setQueryData(['data', 'self', window.start, window.end], usagePoints)
  client.setQueryData(['data', 'flow', 'self', window.start, window.end], flowRows)
  client.setQueryData(['topup', 'history', 1, 10, ''], topUpPage)
}

async function renderUsage(seed?: (client: QueryClient) => void) {
  const rootRoute = createRootRoute()
  const usageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/usage',
    component: UsagePage,
  })
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: () => <div>Settings</div>,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/usage'] }),
    routeTree: rootRoute.addChildren([usageRoute, settingsRoute]),
  })

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  seed?.(queryClient)

  await router.load()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

/** The panel that owns `label`, so a neighbouring card cannot answer instead. */
function panelFor(label: string): HTMLElement {
  const panel = screen.getByText(label).closest('.panel')
  if (!(panel instanceof HTMLElement)) throw new Error(`no panel for ${label}`)
  return panel
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  apiGet.mockReset()
  // Nothing the test does not seed ever resolves, so those queries stay pending.
  apiGet.mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('UsagePage', () => {
  it('reports the spend, request count and per-model split of the selected month', async () => {
    await renderUsage(seedEverything)

    // 40_000_000 quota over the default 500_000 divisor.
    expect(panelFor('Current spend')).toHaveTextContent('$80.00')
    expect(panelFor('Requests')).toHaveTextContent('1,200')
    expect(panelFor('Requests')).toHaveTextContent('2.0M tokens in the same window')

    const models = panelFor('Usage by model')
    expect(models).toHaveTextContent('gpt-4o')
    expect(models).toHaveTextContent('$60.00')
    expect(models).toHaveTextContent('75.0%')
    expect(models).toHaveTextContent('claude-sonnet-4')
    expect(models).toHaveTextContent('$20.00')
    expect(models).toHaveTextContent('25.0%')
  })

  it('labels the projection as an estimate and shows the formula behind it', async () => {
    await renderUsage(seedEverything)

    const projection = panelFor('Projected spend (estimate)')
    expect(projection).toHaveTextContent('charted days')
    expect(projection).toHaveTextContent('Estimated in this console')
  })

  it('names deleted and unattributed keys instead of inventing one', async () => {
    await renderUsage(seedEverything)

    const keys = panelFor('Top API keys')
    expect(keys).toHaveTextContent('Production Router')
    expect(keys).toHaveTextContent('$48.00')
    // token_id 2 came back with no name: the server leaves deleted tokens unresolved.
    expect(keys).toHaveTextContent('Deleted key #2')
    // The row with no token_id at all.
    expect(keys).toHaveTextContent('Not tied to a key')
    // 40_000_000 charted minus the 37_000_000 the flow endpoint could attribute.
    expect(keys).toHaveTextContent('$6.00')
  })

  it('says the order table is capped at 30 days and lists the real orders', async () => {
    await renderUsage(seedEverything)

    const orders = panelFor('Top-up orders')
    expect(orders).toHaveTextContent(
      'The server only returns orders from the last 30 days, whichever billing month is selected above.',
    )
    expect(orders).toHaveTextContent('TN17872080531')
    expect(orders).toHaveTextContent('98.50')
    expect(orders).toHaveTextContent('pending')
  })

  it('shows loading placeholders rather than zeros before anything resolves', async () => {
    await renderUsage()

    expect(await screen.findByText('Loading your spend')).toBeInTheDocument()
    expect(screen.getByText('Loading usage by model')).toBeInTheDocument()
    expect(screen.getByText('Loading spend per key')).toBeInTheDocument()
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
  })

  it('surfaces a retryable error when the usage request fails', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === '/api/data/self') return Promise.reject(new Error('upstream exploded'))
      return new Promise(() => {})
    })

    await renderUsage((client) => {
      client.setQueryData(['server-status'], { enable_data_export: true, quota_per_unit: 500_000 })
    })

    expect(await screen.findByText('Your usage could not be loaded')).toBeInTheDocument()
    expect(screen.getByText('upstream exploded')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0))
  })

  it('has dropped every element the backend cannot supply', async () => {
    await renderUsage(seedEverything)

    expect(screen.queryByText('Payment method')).not.toBeInTheDocument()
    expect(screen.queryByText(/4242/)).not.toBeInTheDocument()
    expect(screen.queryByText(/monthly limit/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Invoice/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download invoice' })).not.toBeInTheDocument()
  })

  it('gives the billing month picker an accessible name', async () => {
    await renderUsage(seedEverything)

    const picker = screen.getByRole('combobox', { name: 'Billing month' })
    expect(picker).toHaveValue('2026-08')
  })
})
