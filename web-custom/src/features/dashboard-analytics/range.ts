import { MAX_DATA_RANGE_SECONDS } from '@/lib/api/usage-data'
import { fromUnixSeconds, toUnixSeconds } from '@/lib/format'

const HOUR_SECONDS = 3600
const DAY_SECONDS = 24 * HOUR_SECONDS

export type DataRangeId = '24h' | '7d' | '30d'

/**
 * `/api/data/self` and `/api/data/flow/self` answer `success:false` with NO data
 * for any window wider than MAX_DATA_RANGE_SECONDS (2_592_000 = 30 days). Verified
 * live: a 2_592_000 second window returns 200 with rows, a 2_700_000 second one
 * returns `{"success":false,"message":"时间跨度不能超过 1 个月"}`.
 *
 * The admin routes (`/api/data/`, `/api/data/users`, `/api/data/flow`) do NOT
 * enforce it — a 31 day window really does return rows there — but the control
 * still stops at 30 days so one range drives every scope on both pages and the
 * self scope never silently produces an error.
 */
const rangeSeconds: Record<DataRangeId, number> = {
  '24h': DAY_SECONDS,
  '7d': 7 * DAY_SECONDS,
  '30d': Math.min(30 * DAY_SECONDS, MAX_DATA_RANGE_SECONDS),
}

export const DATA_RANGE_IDS: readonly DataRangeId[] = ['24h', '7d', '30d']

/** Windows up to this length keep hourly buckets; wider ones roll up to local days. */
const DAILY_BUCKET_THRESHOLD_SECONDS = 2 * DAY_SECONDS

/**
 * Boundaries snap to a 5 minute grid. Without it the window would move on every
 * render, and every render would mint a fresh React Query key and refetch.
 */
const WINDOW_ALIGNMENT_SECONDS = 300

export type DataBucket = 'hour' | 'day'

export type DataWindow = {
  rangeId: DataRangeId
  start: number
  end: number
  bucket: DataBucket
}

export function alignedWindowEnd(nowSeconds = toUnixSeconds(new Date())): number {
  return Math.floor(nowSeconds / WINDOW_ALIGNMENT_SECONDS) * WINDOW_ALIGNMENT_SECONDS
}

export function resolveDataWindow(rangeId: DataRangeId, endSeconds: number): DataWindow {
  const span = rangeSeconds[rangeId]
  return {
    rangeId,
    start: endSeconds - span,
    end: endSeconds,
    bucket: span <= DAILY_BUCKET_THRESHOLD_SECONDS ? 'hour' : 'day',
  }
}

/** Local midnight of the day containing `seconds`. */
export function localDayStart(seconds: number): number {
  const date = fromUnixSeconds(seconds)
  date.setHours(0, 0, 0, 0)
  return toUnixSeconds(date)
}

/**
 * Every bucket boundary the window covers, zero-filled by the callers. A bucket
 * with no row genuinely saw no traffic: `quota_data` gains a row only when a
 * request was recorded.
 */
export function bucketBoundaries(window: DataWindow): number[] {
  const boundaries: number[] = []

  if (window.bucket === 'hour') {
    // `created_at` is truncated to the hour server-side, so the earliest bucket
    // the server can return is the first hour boundary at or after `start`.
    const first = Math.ceil(window.start / HOUR_SECONDS) * HOUR_SECONDS
    const last = Math.floor(window.end / HOUR_SECONDS) * HOUR_SECONDS
    for (let timestamp = first; timestamp <= last; timestamp += HOUR_SECONDS) {
      boundaries.push(timestamp)
    }
    return boundaries
  }

  const cursor = fromUnixSeconds(localDayStart(window.start))
  const last = localDayStart(window.end)
  while (toUnixSeconds(cursor) <= last) {
    boundaries.push(toUnixSeconds(cursor))
    // Stepping the Date rather than adding 86_400 keeps every boundary on local
    // midnight across a daylight saving change.
    cursor.setDate(cursor.getDate() + 1)
  }
  return boundaries
}

export function bucketFor(seconds: number, bucket: DataBucket): number {
  return bucket === 'hour' ? seconds : localDayStart(seconds)
}
