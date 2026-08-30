import type { Tone } from '@/components/ui'
import type { ModelPerfSummary } from '@/lib/api/metrics'

/**
 * The model performance summary module, ported from
 * `web/src/features/performance-metrics/lib/format.ts` and its one consumer
 * `web/src/features/dashboard/components/overview/performance-health-panel.tsx`.
 *
 * The payload it grades is `GET /api/perf-metrics/summary`, already wrapped by
 * `lib/api/metrics.ts`. Three figures per model and nothing else:
 * `avg_latency_ms`, `success_rate` (0..100) and `avg_tps`.
 */

export type SuccessRateLevel = 'excellent' | 'good' | 'warning' | 'critical' | 'unknown'

/** Verbatim from the legacy module — the only grading the old console performed. */
export const SUCCESS_RATE_EXCELLENT_MIN = 100
export const SUCCESS_RATE_GOOD_MIN = 90
export const SUCCESS_RATE_WARNING_MIN = 70

export function successRateLevel(rate: number): SuccessRateLevel {
  if (!Number.isFinite(rate)) return 'unknown'
  if (rate >= SUCCESS_RATE_EXCELLENT_MIN) return 'excellent'
  if (rate >= SUCCESS_RATE_GOOD_MIN) return 'good'
  if (rate >= SUCCESS_RATE_WARNING_MIN) return 'warning'
  return 'critical'
}

/** The legacy palette had two greens; this skin's tone vocabulary has one. */
export const SUCCESS_RATE_TONE: Record<SuccessRateLevel, Tone> = {
  excellent: 'success',
  good: 'success',
  warning: 'warning',
  critical: 'destructive',
  unknown: 'muted',
}

export const SUCCESS_RATE_LABEL: Record<SuccessRateLevel, string> = {
  excellent: 'No failures',
  good: 'Healthy',
  warning: 'Degraded',
  critical: 'Failing',
  unknown: 'No data',
}

export function successRateTone(rate: number): Tone {
  return SUCCESS_RATE_TONE[successRateLevel(rate)]
}

/** `formatThroughput` from the legacy module, unchanged. */
export function formatThroughput(tps: number): string {
  if (!Number.isFinite(tps) || tps <= 0) return '—'
  if (tps >= 1_000) return `${(tps / 1_000).toFixed(1)}K t/s`
  return `${tps.toFixed(tps < 10 ? 2 : 1)} t/s`
}

/** `formatUptimePct` from the legacy module, unchanged. */
export function formatSuccessRate(percent: number): string {
  if (!Number.isFinite(percent)) return '—'
  return `${percent.toFixed(2)}%`
}

type AveragedMetric = 'avg_latency_ms' | 'avg_tps' | 'success_rate'

/**
 * UNWEIGHTED mean across models, as in the legacy panel.
 *
 * The server sorts `models` by request count but strips the count itself
 * (`RequestCount int64 \`json:"-"\`` in pkg/perf_metrics/types.go), so a
 * traffic-weighted average is not computable from this payload. Every model counts
 * once, and the UI says so beside the figure.
 */
function unweightedMean(
  models: readonly ModelPerfSummary[],
  metric: AveragedMetric,
  isValid: (value: number) => boolean,
): number {
  let total = 0
  let count = 0
  for (const model of models) {
    const value = model[metric]
    if (typeof value !== 'number' || !isValid(value)) continue
    total += value
    count += 1
  }
  return count > 0 ? total / count : Number.NaN
}

export type ModelPerformanceRollup = {
  /** Mean of `avg_latency_ms` over models with a positive latency. */
  avgLatencyMs: number
  /** Mean of `avg_tps` over models with positive throughput. */
  avgTps: number
  /** Mean of `success_rate` over every model, failures included. */
  successRate: number
  modelCount: number
}

export function rollupModelPerformance(
  models: readonly ModelPerfSummary[],
): ModelPerformanceRollup {
  const positive = (value: number) => Number.isFinite(value) && value > 0
  return {
    avgLatencyMs: unweightedMean(models, 'avg_latency_ms', positive),
    avgTps: unweightedMean(models, 'avg_tps', positive),
    modelCount: models.length,
    successRate: unweightedMean(models, 'success_rate', Number.isFinite),
  }
}

/** Windows offered by the summary picker. The server clamps to 1..720 hours. */
export const PERFORMANCE_WINDOW_HOURS = [1, 6, 24, 168, 720] as const

export type PerformanceWindowHours = (typeof PERFORMANCE_WINDOW_HOURS)[number]

export const DEFAULT_PERFORMANCE_WINDOW_HOURS: PerformanceWindowHours = 24

export function isPerformanceWindow(value: number): value is PerformanceWindowHours {
  return (PERFORMANCE_WINDOW_HOURS as readonly number[]).includes(value)
}
