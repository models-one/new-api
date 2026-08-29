// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AnalyticsPage } from '@/features/analytics/AnalyticsPage'
import { getJson } from '@/lib/api/client'
import type { ModelPerfSummary } from '@/lib/api/metrics'
import { MAX_DATA_RANGE_SECONDS, type QuotaDataPoint } from '@/lib/api/usage-data'

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
 * Field for field what a live `GET /api/data/self` row carries: the handler only
 * fills user_id, username, model_name, created_at, count, quota and token_used.
 */
function buildPoint(overrides: Partial<QuotaDataPoint> = {}): QuotaDataPoint {
  return {
    id: 0,
    user_id: 1,
    username: 'root',
    model_name: 'gpt-4o',
    created_at: 1787900000 - (1787900000 % 3600),
    use_group: '',
    token_id: 0,
    channel_id: 0,
    node_name: '',
    token_used: 120_000,
    count: 300,
    quota: 2_500_000,
    ...overrides,
  }
}

function buildPerfModel(overrides: Partial<ModelPerfSummary> = {}): ModelPerfSummary {
  return {
    model_name: 'gpt-4o',
    avg_latency_ms: 842,
    success_rate: 99.5,
    avg_tps: 41.25,
    ...overrides,
  }
}

type UsageWindow = { start: number; end: number }

let usageWindows: UsageWindow[] = []
let perfHours: number[] = []

function respondWith(options: {
  current: QuotaDataPoint[]
  /** An Error stands in for the baseline window failing rather than coming back empty. */
  previous: QuotaDataPoint[] | Error
  models?: ModelPerfSummary[]
}) {
  mockedGetJson.mockImplementation(async (url, config) => {
    const params = (config?.params ?? {}) as Record<string, number>

    if (url === '/api/status') return { quota_per_unit: 500_000, enable_data_export: true }

    if (url === '/api/data/self') {
      usageWindows.push({ end: params.end_timestamp, start: params.start_timestamp })
      // The later of the two windows is the selected range; the earlier one is
      // the baseline the page compares against.
      const isCurrent = usageWindows.every((entry) => entry.start <= params.start_timestamp)
      if (isCurrent) return options.current
      if (options.previous instanceof Error) throw options.previous
      return options.previous
    }

    if (url === '/api/perf-metrics/summary') {
      perfHours.push(params.hours)
      return { models: options.models ?? [] }
    }

    throw new Error(`unexpected url ${url}`)
  })
}

/** The StatCard panel that owns `label`, so chart data tables cannot answer instead. */
function statCard(label: string): HTMLElement {
  const panel = screen.getByText(label).closest('.panel')
  if (!(panel instanceof HTMLElement)) throw new Error(`no stat card for ${label}`)
  return panel
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  })
  const wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
  )
  return render(<AnalyticsPage />, { wrapper })
}

beforeEach(() => {
  usageWindows = []
  perfHours = []
  mockedGetJson.mockReset()
})

afterEach(cleanup)

describe('AnalyticsPage', () => {
  it('shows the user their own totals and a change against the preceding window', async () => {
    respondWith({
      current: [buildPoint()],
      previous: [buildPoint({ count: 240, quota: 2_000_000, token_used: 96_000 })],
    })

    renderPage()

    await screen.findByText('Total requests')
    expect(within(statCard('Total requests')).getByText('300')).toBeInTheDocument()
    expect(within(statCard('Total tokens')).getByText('120K')).toBeInTheDocument()
    expect(within(statCard('Total spend')).getByText('$5')).toBeInTheDocument()

    // (300 - 240) / 240, computed here from two real windows of equal length.
    await waitFor(() => {
      expect(screen.getAllByText('+25.0%')).toHaveLength(3)
    })
    expect(screen.getAllByText('vs previous 7 days')).toHaveLength(3)
  })

  it('omits the change and says why when the preceding window recorded nothing', async () => {
    respondWith({ current: [buildPoint()], previous: [] })

    renderPage()

    await screen.findByText('Total requests')
    expect(within(statCard('Total requests')).getByText('300')).toBeInTheDocument()
    expect(screen.queryByText(/vs previous/)).not.toBeInTheDocument()
    expect(
      await screen.findByText(
        'No change is shown because nothing was recorded in the previous 7 days.',
      ),
    ).toBeInTheDocument()
  })

  it('says the baseline failed rather than claiming the previous window was empty', async () => {
    respondWith({ current: [buildPoint()], previous: new Error('baseline unavailable') })

    renderPage()

    await screen.findByText('Total requests')
    expect(
      await screen.findByText(
        'No change is shown because the previous 7 days could not be loaded.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'No change is shown because nothing was recorded in the previous 7 days.',
      ),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/vs previous/)).not.toBeInTheDocument()
  })

  it('never requests a window wider than the server ceiling, at any range', async () => {
    respondWith({ current: [buildPoint()], previous: [] })

    renderPage()
    await screen.findByText('Total requests')

    const rangeGroup = screen.getByRole('group', { name: 'Analytics range' })
    const options = within(rangeGroup).getAllByRole('button')
    expect(options.map((option) => option.textContent)).toEqual(['24h', '7d', '30d'])

    for (const option of options) {
      fireEvent.click(option)
    }

    await waitFor(() => {
      expect(perfHours).toContain(720)
    })
    for (const window of usageWindows) {
      expect(window.end - window.start).toBeLessThanOrEqual(MAX_DATA_RANGE_SECONDS)
    }
    // The clamp is real: 720 is the widest `hours` the summary endpoint accepts.
    expect(Math.max(...perfHours)).toBe(720)
  })

  it('keeps service-wide latency out of the user stat row and labels it as platform data', async () => {
    respondWith({
      current: [buildPoint()],
      models: [buildPerfModel()],
      previous: [],
    })

    renderPage()

    const healthTable = await screen.findByRole('table', {
      name: 'Platform service health by model',
    })
    expect(await within(healthTable).findByText('842ms')).toBeInTheDocument()
    expect(within(healthTable).getByText('99.50%')).toBeInTheDocument()
    expect(within(healthTable).getByText('Healthy')).toBeInTheDocument()

    expect(
      screen.getByText(
        'Measured across every request this gateway served in the last 7 days, by all users. These figures are not your own traffic.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Health is a label this console derives from the success rate: 99% or above is Healthy, 90% or above is Degraded, below that is Unhealthy.',
      ),
    ).toBeInTheDocument()
  })

  it('offers a real empty state instead of zeros when the range has no usage', async () => {
    respondWith({ current: [], previous: [] })

    renderPage()

    expect(await screen.findByText('No usage in this range')).toBeInTheDocument()
    expect(screen.getByText('No model usage yet')).toBeInTheDocument()
    expect(screen.getByText('No service metrics available')).toBeInTheDocument()
  })

  it('derives the token share for each model from the user own rows', async () => {
    respondWith({
      current: [
        buildPoint({ model_name: 'gpt-4o', token_used: 75_000 }),
        buildPoint({ model_name: 'claude-sonnet-4', token_used: 25_000 }),
      ],
      previous: [],
    })

    renderPage()

    expect(await screen.findByText('gpt-4o')).toBeInTheDocument()
    expect(screen.getByText('75.0%')).toBeInTheDocument()
    expect(screen.getByText('25.0%')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: 'Token share for gpt-4o' }),
    ).toHaveAttribute('aria-valuetext', '75.0% of your tokens, 75K tokens')
  })
})
