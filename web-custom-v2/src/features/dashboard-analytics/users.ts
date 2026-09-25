import { bucketBoundaries, bucketFor, type DataWindow } from '@/features/dashboard-analytics/range'
import type { QuotaDataPoint } from '@/lib/api/usage-data'

export type UsageMetric = 'quota' | 'tokens' | 'requests'

export type UsageTotals = {
  quota: number
  tokens: number
  requests: number
}

export type UserTotals = UsageTotals & {
  /** The only identity `/api/data/users` reports; `user_id` is always 0 there. */
  username: string
  /** Percentage of {@link sumUsage}'s quota over the same rows. Derived here. */
  share: number
}

/** Top-N sizes the ranking offers. Mirrors the legacy console's list. */
export const TOP_USER_LIMITS: readonly number[] = [5, 10, 20, 50]

export function metricValue(totals: UsageTotals, metric: UsageMetric): number {
  if (metric === 'requests') return totals.requests
  if (metric === 'tokens') return totals.tokens
  return totals.quota
}

export function sumUsage(points: readonly QuotaDataPoint[]): UsageTotals {
  return points.reduce<UsageTotals>(
    (total, point) => ({
      quota: total.quota + point.quota,
      tokens: total.tokens + point.token_used,
      requests: total.requests + point.count,
    }),
    { quota: 0, tokens: 0, requests: 0 },
  )
}

/**
 * Collapses the per-user-per-hour rows of `GET /api/data/users` into one entry
 * per user, largest spend first.
 *
 * A row with an empty `username` keeps the empty string; the caller labels it,
 * because "the server attributed this to nobody" is not the same claim as a
 * user literally named "unknown".
 */
export function aggregateByUser(points: readonly QuotaDataPoint[]): UserTotals[] {
  const byUser = new Map<string, UserTotals>()

  for (const point of points) {
    const existing = byUser.get(point.username)
    if (existing) {
      existing.quota += point.quota
      existing.tokens += point.token_used
      existing.requests += point.count
      continue
    }
    byUser.set(point.username, {
      username: point.username,
      quota: point.quota,
      tokens: point.token_used,
      requests: point.count,
      share: 0,
    })
  }

  const total = sumUsage(points).quota
  return [...byUser.values()]
    .map((user) => ({ ...user, share: total > 0 ? (user.quota / total) * 100 : 0 }))
    .sort((left, right) => right.quota - left.quota || left.username.localeCompare(right.username))
}

/**
 * Ranks by the SELECTED metric rather than always by quota, so switching to
 * requests reorders the bars instead of leaving a spend ranking mislabelled.
 * Users contributing nothing to the metric are dropped: a zero-length bar in a
 * "top 10" says nothing.
 */
export function rankUsers(
  users: readonly UserTotals[],
  metric: UsageMetric,
  limit: number,
): UserTotals[] {
  return [...users]
    .filter((user) => metricValue(user, metric) > 0)
    .sort(
      (left, right) =>
        metricValue(right, metric) - metricValue(left, metric)
        || left.username.localeCompare(right.username),
    )
    .slice(0, Math.max(1, limit))
}

export type TrendPoint = { x: number } & UsageTotals

export type UserTrend = {
  username: string
  points: TrendPoint[]
}

/**
 * One zero-filled series per named user across the window's buckets.
 *
 * Zero-filling matters here: without it a user idle for a day would have their
 * line drawn straight through the gap, implying steady traffic that never
 * happened.
 */
export function buildUserTrends(
  points: readonly QuotaDataPoint[],
  usernames: readonly string[],
  window: DataWindow,
): UserTrend[] {
  const boundaries = bucketBoundaries(window)
  const wanted = new Set(usernames)

  const series = new Map<string, Map<number, TrendPoint>>()
  for (const username of usernames) {
    const buckets = new Map<number, TrendPoint>()
    for (const boundary of boundaries) {
      buckets.set(boundary, { x: boundary, quota: 0, tokens: 0, requests: 0 })
    }
    series.set(username, buckets)
  }

  for (const point of points) {
    if (!wanted.has(point.username)) continue
    const bucket = series.get(point.username)?.get(bucketFor(point.created_at, window.bucket))
    if (!bucket) continue
    bucket.quota += point.quota
    bucket.tokens += point.token_used
    bucket.requests += point.count
  }

  return usernames.map((username) => ({
    username,
    points: [...(series.get(username)?.values() ?? [])].sort((left, right) => left.x - right.x),
  }))
}

export type ModelTotals = UsageTotals & {
  model: string
  /** Percentage of the platform quota in the same response. Derived here. */
  share: number
}

/**
 * The platform-wide model split from `GET /api/data/`, whose rows carry
 * `model_name` and an EMPTY `username` (the SELECT groups by model and hour).
 */
export function aggregateByModel(points: readonly QuotaDataPoint[]): ModelTotals[] {
  const byModel = new Map<string, ModelTotals>()

  for (const point of points) {
    const existing = byModel.get(point.model_name)
    if (existing) {
      existing.quota += point.quota
      existing.tokens += point.token_used
      existing.requests += point.count
      continue
    }
    byModel.set(point.model_name, {
      model: point.model_name,
      quota: point.quota,
      tokens: point.token_used,
      requests: point.count,
      share: 0,
    })
  }

  const total = sumUsage(points).quota
  return [...byModel.values()]
    .map((model) => ({ ...model, share: total > 0 ? (model.quota / total) * 100 : 0 }))
    .sort((left, right) => right.quota - left.quota || left.model.localeCompare(right.model))
}

/** Models charted individually before the remainder is folded into one row. */
export const MODEL_SLICE_LIMIT = 6

/** Sums everything past {@link MODEL_SLICE_LIMIT} into one honest remainder. */
export function foldRemainingModels(models: readonly ModelTotals[]): ModelTotals | null {
  const rest = models.slice(MODEL_SLICE_LIMIT)
  if (rest.length === 0) return null

  return rest.reduce<ModelTotals>(
    (total, model) => ({
      model: '',
      quota: total.quota + model.quota,
      tokens: total.tokens + model.tokens,
      requests: total.requests + model.requests,
      share: total.share + model.share,
    }),
    { model: '', quota: 0, tokens: 0, requests: 0, share: 0 },
  )
}
