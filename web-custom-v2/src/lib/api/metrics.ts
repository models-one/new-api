import { queryOptions } from '@tanstack/react-query'

import { getJson } from '@/lib/api/client'

/**
 * `GET /api/perf-metrics/summary` (pkg/perf_metrics/types.go ModelSummary).
 * These are PLATFORM-WIDE figures per model, not the calling user's own traffic —
 * present them as service health, never as "your latency".
 */
export type ModelPerfSummary = {
  model_name: string
  avg_latency_ms: number
  /** 0..100 */
  success_rate: number
  avg_tps: number
  recent_success_rates?: number[]
}

/** The server clamps `hours` to 1..720. */
export function perfSummaryQuery(hours = 24) {
  return queryOptions({
    queryKey: ['perf-metrics', 'summary', hours],
    queryFn: () =>
      getJson<{ models: ModelPerfSummary[] }>('/api/perf-metrics/summary', {
        params: { hours: Math.min(720, Math.max(1, hours)) },
      }),
    staleTime: 60 * 1000,
  })
}

export type HealthTone = 'success' | 'warning' | 'destructive'

/**
 * The backend has no health enum — only a raw success rate. These thresholds are a
 * console-side presentation choice and are stated as such in the UI.
 */
export function healthFromSuccessRate(successRate: number): { tone: HealthTone; key: string } {
  if (successRate >= 99) return { tone: 'success', key: 'Healthy' }
  if (successRate >= 90) return { tone: 'warning', key: 'Degraded' }
  return { tone: 'destructive', key: 'Unhealthy' }
}

export type VendorHealth = {
  vendor: string
  avgLatencyMs: number
  successRate: number
  modelCount: number
}

/**
 * Rolls per-model metrics up to the vendor level using the model->vendor mapping
 * from `/api/pricing`, weighting by model count since request counts are not exposed.
 */
export function aggregateByVendor(
  models: ModelPerfSummary[],
  vendorOf: (modelName: string) => string,
): VendorHealth[] {
  const byVendor = new Map<string, { latency: number; success: number; count: number }>()
  for (const model of models) {
    const vendor = vendorOf(model.model_name)
    if (!vendor) continue
    const bucket = byVendor.get(vendor) ?? { latency: 0, success: 0, count: 0 }
    bucket.latency += model.avg_latency_ms
    bucket.success += model.success_rate
    bucket.count += 1
    byVendor.set(vendor, bucket)
  }
  return [...byVendor.entries()]
    .map(([vendor, bucket]) => ({
      vendor,
      avgLatencyMs: Math.round(bucket.latency / bucket.count),
      successRate: bucket.success / bucket.count,
      modelCount: bucket.count,
    }))
    .sort((a, b) => b.modelCount - a.modelCount)
}
