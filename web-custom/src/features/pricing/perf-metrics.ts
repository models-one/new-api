import { queryOptions } from '@tanstack/react-query'

import { PUBLIC_REQUEST } from '@/features/pricing/public-queries'
import { getJson } from '@/lib/api/client'

/**
 * `GET /api/perf-metrics` (pkg/perf_metrics/types.go QueryResult).
 *
 * These are SERVICE-WIDE figures aggregated across every user's traffic, never the viewer's
 * own. The endpoint HARD-REQUIRES the `model` query parameter — without it the server answers
 * HTTP 400 `model is required`, verified against the running instance — and returns
 * `groups: []` for a model with no recorded relays. It is reachable by anonymous visitors
 * whenever the pricing nav module is public.
 */
export type PerfSeriesPoint = {
  /** Bucket start, unix SECONDS. */
  ts: number
  avg_ttft_ms: number
  avg_latency_ms: number
  /** Percent, 0..100 — `successCount / requestCount * 100` server-side. */
  success_rate: number
  avg_tps: number
}

export type PerfGroupMetrics = {
  group: string
  avg_ttft_ms: number
  avg_latency_ms: number
  success_rate: number
  avg_tps: number
  series: PerfSeriesPoint[]
}

export type ModelPerfMetrics = {
  model_name: string
  series_schema?: string
  groups: PerfGroupMetrics[]
}

/** The server clamps `hours` to 1..720 (30 days). */
export const PERF_METRICS_HOURS = 24

export function modelPerfMetricsQuery(modelName: string, hours = PERF_METRICS_HOURS) {
  return queryOptions({
    queryKey: ['perf-metrics', 'model', modelName, hours],
    queryFn: () =>
      getJson<ModelPerfMetrics>('/api/perf-metrics', {
        ...PUBLIC_REQUEST,
        params: { model: modelName, hours: Math.min(720, Math.max(1, hours)) },
      }),
    // The endpoint 400s on an empty model, so never let the query run without one.
    enabled: modelName !== '',
    staleTime: 60 * 1000,
  })
}

/** Sustained generation speed. The API reports tokens per second as a float. */
export function formatThroughput(tokensPerSecond: number): string {
  if (!Number.isFinite(tokensPerSecond) || tokensPerSecond <= 0) return '—'
  if (tokensPerSecond >= 1000) return `${(tokensPerSecond / 1000).toFixed(1)}K t/s`
  return `${tokensPerSecond.toFixed(tokensPerSecond < 10 ? 2 : 1)} t/s`
}

export type PerfTotals = {
  avgTtftMs: number
  avgLatencyMs: number
  successRate: number
  avgTps: number
}

/**
 * The headline figures across the reported groups.
 *
 * `ModelSummary.RequestCount` is json:"-", so the API publishes no per-group request counts and
 * the groups can only be averaged unweighted. Zero readings are dropped from the latency and
 * throughput means because the server writes 0 for "not measured" (no TTFT recorded, no output
 * tokens), which would otherwise drag the average toward a speed nobody observed. Success rate
 * keeps its zeroes: a group that failed every request really did score 0%.
 */
export function averageAcrossGroups(groups: readonly PerfGroupMetrics[]): PerfTotals | undefined {
  if (groups.length === 0) return undefined

  const mean = (values: number[]) =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length

  const measured = (read: (group: PerfGroupMetrics) => number) =>
    groups.map(read).filter((value) => Number.isFinite(value) && value > 0)

  return {
    avgTtftMs: Math.round(mean(measured((group) => group.avg_ttft_ms))),
    avgLatencyMs: Math.round(mean(measured((group) => group.avg_latency_ms))),
    successRate: mean(groups.map((group) => group.success_rate).filter(Number.isFinite)),
    avgTps: mean(measured((group) => group.avg_tps)),
  }
}

/** Success rate merged across groups per bucket, oldest first, for the trend line. */
export function successRateSeries(groups: readonly PerfGroupMetrics[]): { x: number; y: number }[] {
  const byBucket = new Map<number, number[]>()
  for (const group of groups) {
    for (const point of group.series) {
      if (!Number.isFinite(point.success_rate)) continue
      const bucket = byBucket.get(point.ts) ?? []
      bucket.push(point.success_rate)
      byBucket.set(point.ts, bucket)
    }
  }

  return [...byBucket.entries()]
    .sort(([left], [right]) => left - right)
    .map(([ts, rates]) => ({
      x: ts,
      y: rates.reduce((sum, rate) => sum + rate, 0) / rates.length,
    }))
}
