import type { ModelPerfSummary } from '@/lib/api/metrics'
import { MAX_DATA_RANGE_SECONDS } from '@/lib/api/usage-data'
import { toUnixSeconds } from '@/lib/format'

const HOUR_SECONDS = 3_600
const DAY_SECONDS = 24 * HOUR_SECONDS

/**
 * Windows offered by the volume chart. `30d` is exactly MAX_DATA_RANGE_SECONDS:
 * `/api/data/self` rejects any wider window outright instead of truncating it.
 */
export const VOLUME_RANGE_SECONDS = {
  '24h': DAY_SECONDS,
  '7d': 7 * DAY_SECONDS,
  '30d': MAX_DATA_RANGE_SECONDS,
} as const

export type VolumeRange = keyof typeof VOLUME_RANGE_SECONDS

/**
 * `/api/data/self` truncates every row to the start of its hour, so a window ends
 * on the next hour boundary: it covers the in-progress hour and keeps the query
 * key — and therefore the cache entry — stable between renders.
 */
export function hourWindowEnd(now: Date = new Date()): number {
  return (Math.floor(toUnixSeconds(now) / HOUR_SECONDS) + 1) * HOUR_SECONDS
}

/**
 * The runout estimate reads exactly one day of usage, so the quota spent inside
 * the window is already the spend per day.
 */
export const RUNOUT_WINDOW_SECONDS = DAY_SECONDS

/**
 * CLIENT-SIDE ESTIMATE, not a server figure: the remaining balance divided by the
 * quota spent during the last RUNOUT_WINDOW_SECONDS. Returns null when that window
 * cost nothing — there is no rate to project from and the division would be
 * Infinity — and when the balance is already gone.
 */
export function estimateRunoutDays(
  remainingQuota: number,
  quotaSpentInWindow: number,
): number | null {
  if (!Number.isFinite(remainingQuota) || !Number.isFinite(quotaSpentInWindow)) return null
  if (remainingQuota <= 0 || quotaSpentInWindow <= 0) return null
  return remainingQuota / quotaSpentInWindow
}

/** One decimal below ten days, none above: "0.4" reads better than "0". */
export function formatRunoutDays(days: number): string {
  return days.toFixed(days < 10 ? 1 : 0)
}

/**
 * Equal-weight mean of the per-model success rates. `/api/perf-metrics/summary`
 * exposes no request counts, so no model can be weighted by its traffic.
 */
export function averageSuccessRate(models: readonly ModelPerfSummary[]): number | null {
  if (models.length === 0) return null
  return models.reduce((total, model) => total + model.success_rate, 0) / models.length
}

/** Display initials for a provider tile ("OpenAI" -> "OPE"). Presentation only. */
export function vendorInitials(vendor: string): string {
  return vendor.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3).toUpperCase()
}
