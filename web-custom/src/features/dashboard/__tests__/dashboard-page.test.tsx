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
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { KEY_PREVIEW_SIZE } from '@/features/dashboard/components/ApiKeysPanel'
import { PERF_WINDOW_HOURS } from '@/features/dashboard/components/UpstreamProvidersSection'
import { RUNOUT_WINDOW_SECONDS, hourWindowEnd } from '@/features/dashboard/estimates'

/** No request ever resolves, so anything the test does not seed stays in its loading state. */
vi.mock('@/lib/http-client', () => ({
  api: {
    get: () => new Promise(() => {}),
    post: () => new Promise(() => {}),
    put: () => new Promise(() => {}),
    delete: () => new Promise(() => {}),
  },
}))

afterEach(cleanup)

async function renderDashboard(seed: (client: QueryClient, windowEnd: number) => void) {
  const rootRoute = createRootRoute()
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    component: DashboardPage,
  })
  const walletRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/wallet',
    component: () => <div>Wallet</div>,
  })
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: () => <div>Settings</div>,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    routeTree: rootRoute.addChildren([dashboardRoute, walletRoute, settingsRoute]),
  })

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  seed(queryClient, hourWindowEnd())

  await router.load()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function seedBalanceAndKeys(client: QueryClient, windowEnd: number) {
  client.setQueryData(['server-status'], { quota_per_unit: 500_000 })
  client.setQueryData(['user', 'self'], {
    quota: 100_000_000,
    used_quota: 25_000_000,
    group: 'default',
  })
  client.setQueryData(['data', 'self', windowEnd - RUNOUT_WINDOW_SECONDS, windowEnd], [
    { created_at: windowEnd - 7_200, model_name: 'gpt-4o-mini', count: 40, token_used: 90_000, quota: 1_000_000 },
    { created_at: windowEnd - 3_600, model_name: 'gpt-4o-mini', count: 20, token_used: 40_000, quota: 1_000_000 },
  ])
  client.setQueryData(['tokens', 1, KEY_PREVIEW_SIZE], {
    page: 1,
    page_size: KEY_PREVIEW_SIZE,
    total: 3,
    items: [
      { id: 1, name: 'Production Router', key: 'VGjC**********8k3k', status: 1 },
      { id: 2, name: 'Cost Optimized', key: '4oA1**********1FUB', status: 2 },
    ],
  })
}

describe('DashboardPage', () => {
  it('renders the balance, the labelled runout estimate and the account group', async () => {
    await renderDashboard(seedBalanceAndKeys)

    const balance = screen.getByRole('region', { name: 'Current balance' })
    expect(balance).toHaveTextContent('$200.00')
    expect(balance).toHaveTextContent('Estimated 50 days left at the last 24 hours of spend')
    expect(balance).toHaveTextContent('Group default')
    expect(balance).toHaveTextContent('$50.00')
  })

  it('drops the runout estimate when the last day cost nothing', async () => {
    await renderDashboard((client, windowEnd) => {
      seedBalanceAndKeys(client, windowEnd)
      client.setQueryData(['data', 'self', windowEnd - RUNOUT_WINDOW_SECONDS, windowEnd], [])
    })

    expect(screen.queryByText(/Estimated .* days left/)).toBeNull()
  })

  it('rolls service-wide model metrics up to labelled provider cards', async () => {
    await renderDashboard((client, windowEnd) => {
      seedBalanceAndKeys(client, windowEnd)
      client.setQueryData(['perf-metrics', 'summary', PERF_WINDOW_HOURS], {
        models: [
          { model_name: 'gpt-4o-mini', avg_latency_ms: 300, success_rate: 100, avg_tps: 42 },
          { model_name: 'gpt-image-1', avg_latency_ms: 384, success_rate: 99.4, avg_tps: 12 },
        ],
      })
      client.setQueryData(['pricing'], {
        success: true,
        data: [
          { model_name: 'gpt-4o-mini', vendor_id: 1 },
          { model_name: 'gpt-image-1', vendor_id: 1 },
        ],
        vendors: [{ id: 1, name: 'OpenAI' }],
      })
    })

    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('342ms')).toBeInTheDocument()
    expect(screen.getByText(/not your own traffic/)).toBeInTheDocument()
    expect(screen.getByText('Service-wide Healthy')).toBeInTheDocument()
  })

  it('reports honestly when the service has recorded no provider metrics', async () => {
    await renderDashboard((client, windowEnd) => {
      seedBalanceAndKeys(client, windowEnd)
      client.setQueryData(['perf-metrics', 'summary', PERF_WINDOW_HOURS], { models: [] })
      client.setQueryData(['pricing'], { success: true, data: [], vendors: [] })
    })

    expect(screen.getByText('No upstream performance data yet')).toBeInTheDocument()
    expect(screen.queryByText(/Service-wide (Healthy|Degraded|Unhealthy)/)).toBeNull()
  })

  it('prefixes the masked key and keeps the removed environment column out', async () => {
    await renderDashboard(seedBalanceAndKeys)

    expect(screen.getByText('sk-VGjC**********8k3k')).toBeInTheDocument()
    expect(screen.getByText('Newest 2 of 3 keys')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Environment' })).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
  })

  it('asks for confirmation before deleting a key', async () => {
    await renderDashboard(seedBalanceAndKeys)

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete key' })[0])

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Deleting Production Router immediately breaks any application still using it.')
  })

  it('keeps every panel in a loading state until its query resolves', async () => {
    await renderDashboard(() => {})

    expect(screen.getByRole('table', { name: 'API keys' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText(/Estimated .* days left/)).toBeNull()
    expect(screen.queryByText('$0.00')).toBeNull()
  })
})
