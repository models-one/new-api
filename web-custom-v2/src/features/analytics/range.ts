import { MAX_DATA_RANGE_SECONDS } from '@/lib/api/usage-data'
import { toUnixSeconds } from '@/lib/format'

export type AnalyticsRangeId = '24h' | '7d' | '30d'

const HOUR_SECONDS = 3600
const DAY_SECONDS = 24 * HOUR_SECONDS

/**
 * `GET /api/data/self` answers `success:false` with no data for any window wider
 * than MAX_DATA_RANGE_SECONDS (30 days). Verified against the live server: a
 * 2_592_000 second window succeeds, a 3_000_000 second one is rejected. The
 * control therefore must not offer anything wider than 30d.
 */
const rangeSeconds: Record<AnalyticsRangeId, number> = {
  '24h': DAY_SECONDS,
  '7d': 7 * DAY_SECONDS,
  '30d': Math.min(30 * DAY_SECONDS, MAX_DATA_RANGE_SECONDS),
}

export const ANALYTICS_RANGE_IDS: readonly AnalyticsRangeId[] = ['24h', '7d', '30d']

/** Chart buckets stay hourly for short windows; wider ones roll up to local days. */
const DAILY_BUCKET_THRESHOLD_SECONDS = 2 * DAY_SECONDS

/**
 * Window boundaries snap to a 5 minute grid. Without it the window would move on
 * every render, and every render would produce a fresh React Query key and refetch.
 */
const WINDOW_ALIGNMENT_SECONDS = 300

export type AnalyticsBucket = 'hour' | 'day'

export type AnalyticsWindow = {
  rangeId: AnalyticsRangeId
  start: number
  end: number
  /** The equally long window immediately before `start`, used for the deltas. */
  previousStart: number
  previousEnd: number
  /** Window length in hours, for `/api/perf-metrics/summary?hours=`. */
  hours: number
  bucket: AnalyticsBucket
}

export function alignedWindowEnd(): number {
  const now = toUnixSeconds(new Date())
  return Math.floor(now / WINDOW_ALIGNMENT_SECONDS) * WINDOW_ALIGNMENT_SECONDS
}

export function resolveAnalyticsWindow(
  rangeId: AnalyticsRangeId,
  endSeconds: number,
): AnalyticsWindow {
  const span = rangeSeconds[rangeId]

  return {
    rangeId,
    start: endSeconds - span,
    end: endSeconds,
    previousStart: endSeconds - span * 2,
    // The server filter is inclusive on both ends, so the previous window stops
    // one second short of `start`; otherwise a bucket landing exactly on the
    // boundary would be counted in both windows and skew the change.
    previousEnd: endSeconds - span - 1,
    hours: Math.round(span / HOUR_SECONDS),
    bucket: span <= DAILY_BUCKET_THRESHOLD_SECONDS ? 'hour' : 'day',
  }
}
