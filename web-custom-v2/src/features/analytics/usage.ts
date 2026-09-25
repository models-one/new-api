import type { AnalyticsWindow } from '@/features/analytics/range'
import { aggregateByHour, aggregateByModel } from '@/lib/api/usage-data'
import type { QuotaDataPoint, SeriesPoint } from '@/lib/api/usage-data'
import { fromUnixSeconds, toUnixSeconds } from '@/lib/format'

const HOUR_SECONDS = 3600

export type UsageTotals = {
  requests: number
  tokens: number
  quota: number
}

export function sumUsage(points: readonly QuotaDataPoint[]): UsageTotals {
  let requests = 0
  let tokens = 0
  let quota = 0

  for (const point of points) {
    requests += point.count
    tokens += point.token_used
    quota += point.quota
  }

  return { requests, tokens, quota }
}

/** Local midnight of the day containing `seconds`. */
function localDayStart(seconds: number): number {
  const date = fromUnixSeconds(seconds)
  date.setHours(0, 0, 0, 0)
  return toUnixSeconds(date)
}

/**
 * Every bucket boundary the window covers. Buckets with no matching row are kept
 * at zero rather than skipped: the backend writes a `quota_data` row only when a
 * request was recorded, so an hour with no row genuinely saw no usage.
 */
function bucketBoundaries(window: AnalyticsWindow): number[] {
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
    // Stepping the Date rather than adding 86400 keeps the boundaries on local
    // midnight across a daylight saving change.
    cursor.setDate(cursor.getDate() + 1)
  }
  return boundaries
}

/** The user's own volume per chart bucket, zero-filled across the whole window. */
export function buildVolumeSeries(
  points: readonly QuotaDataPoint[],
  window: AnalyticsWindow,
): SeriesPoint[] {
  const buckets = new Map<number, SeriesPoint>()
  for (const boundary of bucketBoundaries(window)) {
    buckets.set(boundary, { x: boundary, requests: 0, tokens: 0, quota: 0 })
  }

  for (const hour of aggregateByHour([...points])) {
    const key = window.bucket === 'hour' ? hour.x : localDayStart(hour.x)
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.requests += hour.requests
    bucket.tokens += hour.tokens
    bucket.quota += hour.quota
  }

  return [...buckets.values()].sort((left, right) => left.x - right.x)
}

export type ModelShare = {
  model: string
  requests: number
  tokens: number
  quota: number
  /** Percentage of the window's total tokens, 0..100. Derived in this console. */
  share: number
}

/** Models listed individually before the remainder is folded into one aggregate row. */
export const MODEL_SHARE_ROW_LIMIT = 6

export function buildModelShares(points: readonly QuotaDataPoint[]): ModelShare[] {
  const models = aggregateByModel([...points])
  const totalTokens = models.reduce((sum, model) => sum + model.tokens, 0)
  if (totalTokens <= 0) return []

  return models
    .filter((model) => model.tokens > 0)
    .sort((left, right) => right.tokens - left.tokens)
    .map((model) => ({
      model: model.model,
      requests: model.requests,
      tokens: model.tokens,
      quota: model.quota,
      share: (model.tokens / totalTokens) * 100,
    }))
}

/** Sums the models past {@link MODEL_SHARE_ROW_LIMIT} into one honest remainder row. */
export function foldRemainingShares(shares: readonly ModelShare[]): ModelShare | null {
  const rest = shares.slice(MODEL_SHARE_ROW_LIMIT)
  if (rest.length === 0) return null

  return rest.reduce<ModelShare>(
    (total, model) => ({
      model: total.model,
      requests: total.requests + model.requests,
      tokens: total.tokens + model.tokens,
      quota: total.quota + model.quota,
      share: total.share + model.share,
    }),
    { model: '', requests: 0, tokens: 0, quota: 0, share: 0 },
  )
}

/**
 * Changes smaller than this magnitude round to 0.0% at the displayed precision,
 * so they are drawn as flat instead of as a rise or a fall.
 */
const FLAT_CHANGE_THRESHOLD_PERCENT = 0.05

export type ChangeDirection = 'up' | 'down' | 'flat'

/**
 * Percentage change of `current` against `previous`. Null when the previous
 * window recorded nothing: a change measured from zero has no percentage, and
 * inventing one would be a lie.
 */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

export function changeDirection(change: number): ChangeDirection {
  if (Math.abs(change) < FLAT_CHANGE_THRESHOLD_PERCENT) return 'flat'
  return change > 0 ? 'up' : 'down'
}

/** Rounds sub-threshold changes to exactly zero so the sign matches the arrow. */
export function displayedChange(change: number): number {
  return Math.abs(change) < FLAT_CHANGE_THRESHOLD_PERCENT ? 0 : change
}
