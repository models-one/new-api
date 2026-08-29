import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  averageAcrossGroups,
  formatThroughput,
  modelPerfMetricsQuery,
  successRateSeries,
  type PerfGroupMetrics,
} from '@/features/pricing/perf-metrics'
import { publicPerfSummaryQuery, publicPricingQuery } from '@/features/pricing/public-queries'
import { getJson, getRawJson } from '@/lib/api/client'

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  deleteJson: vi.fn(),
  getJson: vi.fn(),
  getRawJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
}))

const mockedGetJson = vi.mocked(getJson)
const mockedGetRawJson = vi.mocked(getRawJson)

/**
 * `queryOptions` types `queryFn` as optional; every factory here sets one, so this narrows it
 * without an assertion and fails loudly if a factory ever stops providing it.
 */
async function runQueryFn(options: { queryFn?: unknown }): Promise<void> {
  const queryFn = options.queryFn
  if (typeof queryFn !== 'function') throw new Error('queryFn is not set')
  await (queryFn as (context: unknown) => Promise<unknown>)({})
}

afterEach(() => {
  vi.clearAllMocks()
})

/**
 * `lib/http-client` reacts to a 401 by refreshing the session and, on failure, hard-navigating
 * to the legacy sign-in page. On a public page that would throw an anonymous visitor off the
 * route before it could explain itself, so every request this surface makes opts out.
 */
describe('anonymous-safe request config', () => {
  it('never lets a 401 on the catalogue redirect an anonymous visitor', async () => {
    mockedGetRawJson.mockResolvedValue({} as never)
    await runQueryFn(publicPricingQuery())

    const [url, config] = mockedGetRawJson.mock.calls[0]
    expect(url).toBe('/api/pricing')
    expect(config).toMatchObject({ skipAuthRefresh: true, skipErrorHandler: true })
  })

  it('applies the same handling to both performance endpoints', async () => {
    mockedGetJson.mockResolvedValue({} as never)

    await runQueryFn(publicPerfSummaryQuery())
    expect(mockedGetJson.mock.calls[0][0]).toBe('/api/perf-metrics/summary')
    expect(mockedGetJson.mock.calls[0][1]).toMatchObject({
      skipAuthRefresh: true,
      skipErrorHandler: true,
    })

    await runQueryFn(modelPerfMetricsQuery('gpt-4o-mini'))
    expect(mockedGetJson.mock.calls[1][0]).toBe('/api/perf-metrics')
    expect(mockedGetJson.mock.calls[1][1]).toMatchObject({
      skipAuthRefresh: true,
      skipErrorHandler: true,
    })
  })

  it('keeps the catalogue off the console query key so it cannot inherit its fetcher', () => {
    expect(publicPricingQuery().queryKey).toEqual(['pricing', 'public'])
  })
})

describe('modelPerfMetricsQuery', () => {
  it('always sends the model the endpoint hard-requires, and clamps hours to 1..720', async () => {
    mockedGetJson.mockResolvedValue({} as never)

    await runQueryFn(modelPerfMetricsQuery('gpt-4o-mini', 24))
    expect(mockedGetJson.mock.calls[0][1]?.params).toEqual({ model: 'gpt-4o-mini', hours: 24 })

    await runQueryFn(modelPerfMetricsQuery('gpt-4o-mini', 5000))
    expect(mockedGetJson.mock.calls[1][1]?.params).toEqual({ model: 'gpt-4o-mini', hours: 720 })

    await runQueryFn(modelPerfMetricsQuery('gpt-4o-mini', 0))
    expect(mockedGetJson.mock.calls[2][1]?.params).toEqual({ model: 'gpt-4o-mini', hours: 1 })
  })

  it('stays disabled without a model name, because the server answers 400 for one', () => {
    // Verified against the running instance: GET /api/perf-metrics -> 400 "model is required".
    expect(modelPerfMetricsQuery('').enabled).toBe(false)
    expect(modelPerfMetricsQuery('gpt-4o-mini').enabled).toBe(true)
  })
})

describe('performance aggregation', () => {
  const group = (overrides: Partial<PerfGroupMetrics>): PerfGroupMetrics => ({
    group: 'default',
    avg_ttft_ms: 0,
    avg_latency_ms: 0,
    success_rate: 0,
    avg_tps: 0,
    series: [],
    ...overrides,
  })

  it('reports nothing when the gateway has recorded no relays', () => {
    // The live server really does answer `groups: []` for an idle model.
    expect(averageAcrossGroups([])).toBeUndefined()
  })

  it('averages the reported groups, ignoring the zeroes that mean "not measured"', () => {
    const totals = averageAcrossGroups([
      group({ group: 'default', avg_ttft_ms: 200, avg_latency_ms: 1000, success_rate: 100, avg_tps: 40 }),
      group({ group: 'vip', avg_ttft_ms: 0, avg_latency_ms: 2000, success_rate: 50, avg_tps: 0 }),
    ])
    // TTFT and TPS were only measured on one group, so only that reading counts.
    expect(totals?.avgTtftMs).toBe(200)
    expect(totals?.avgTps).toBe(40)
    expect(totals?.avgLatencyMs).toBe(1500)
    // A 50% group really did fail half its requests, so its zero-adjacent rate is kept.
    expect(totals?.successRate).toBe(75)
  })

  it('merges the per-group series into one trend, oldest bucket first', () => {
    const series = successRateSeries([
      group({
        group: 'default',
        series: [
          { ts: 200, avg_ttft_ms: 0, avg_latency_ms: 0, success_rate: 100, avg_tps: 0 },
          { ts: 100, avg_ttft_ms: 0, avg_latency_ms: 0, success_rate: 80, avg_tps: 0 },
        ],
      }),
      group({
        group: 'vip',
        series: [{ ts: 100, avg_ttft_ms: 0, avg_latency_ms: 0, success_rate: 60, avg_tps: 0 }],
      }),
    ])
    expect(series).toEqual([
      { x: 100, y: 70 },
      { x: 200, y: 100 },
    ])
  })
})

describe('formatThroughput', () => {
  it('shows an em dash rather than a fabricated zero for an unmeasured rate', () => {
    expect(formatThroughput(0)).toBe('—')
    expect(formatThroughput(Number.NaN)).toBe('—')
    expect(formatThroughput(4.567)).toBe('4.57 t/s')
    expect(formatThroughput(42.5)).toBe('42.5 t/s')
    expect(formatThroughput(2500)).toBe('2.5K t/s')
  })
})
