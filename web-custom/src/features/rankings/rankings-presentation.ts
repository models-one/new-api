import type { ChartSeries, ChartPoint } from '@/components/chart'
import type { ModelHistorySeries, RankedModel, VendorShareSeries } from '@/features/rankings/api'
import { formatPercent } from '@/lib/format'

/**
 * Pure shaping for the rankings page. Everything here is DERIVED client-side from the
 * `/api/rankings` payload; the derivations are named so the UI can cite them.
 */

/** How many series each history chart draws before the rest are folded away. */
export const HISTORY_SERIES_LIMIT = 6

/**
 * `service/rankings.go` returns `growth_pct: 100` in two different situations:
 * a genuine doubling, and a model that had NO traffic in the preceding window
 * (`rankingGrowthPct` short-circuits to 100 whenever `previous <= 0`). Only `previous_rank`
 * distinguishes them — it is omitted for a new entrant. Presenting a new entrant as "+100%"
 * would be inventing a measurement, so the two cases are separated here.
 */
export type Movement =
  | { kind: 'new' }
  | { kind: 'up'; growthPct: number }
  | { kind: 'down'; growthPct: number }
  | { kind: 'flat' }

export function modelMovement(model: Pick<RankedModel, 'previous_rank' | 'growth_pct'>): Movement {
  if (model.previous_rank === undefined) return { kind: 'new' }
  if (!Number.isFinite(model.growth_pct) || model.growth_pct === 0) return { kind: 'flat' }
  return model.growth_pct > 0
    ? { kind: 'up', growthPct: model.growth_pct }
    : { kind: 'down', growthPct: model.growth_pct }
}

/**
 * The same split for a vendor row, which carries no `previous_rank`. A vendor's growth is
 * therefore always reported as a measurement — the server cannot tell us it is new.
 */
export function vendorMovement(growthPct: number): Movement {
  if (!Number.isFinite(growthPct) || growthPct === 0) return { kind: 'flat' }
  return growthPct > 0 ? { kind: 'up', growthPct } : { kind: 'down', growthPct }
}

/** `↑24.6%` / `↓3.1%`, matching the precision the server rounds to (4 decimals). */
export function formatGrowth(growthPct: number): string {
  const magnitude = Math.abs(growthPct)
  return `${growthPct > 0 ? '+' : '−'}${formatPercent(magnitude, magnitude >= 100 ? 0 : 1)}`
}

/** A 0..1 share as a percentage. Anything under 0.1% collapses rather than reading as 0%. */
export function formatShare(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return '0%'
  if (share < 0.001) return '<0.1%'
  return formatPercent(share * 100, share < 0.01 ? 2 : 1)
}

/** `+2` / `−3` rank places moved. The server never emits a zero delta. */
export function formatRankDelta(delta: number): string {
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`
}

/**
 * One bucket of a history series: its RFC3339 timestamp and the server-rendered axis label.
 * Both histories bucket on the same grid, so this is shared.
 */
export type HistoryBucket = { ts: string; label: string }

type HistoryLikePoint = { ts: string; label: string }

/** Distinct buckets in wire order (the server emits them oldest → newest). */
export function historyBuckets(points: readonly HistoryLikePoint[]): HistoryBucket[] {
  const seen = new Map<string, HistoryBucket>()
  for (const point of points) {
    if (!seen.has(point.ts)) seen.set(point.ts, { ts: point.ts, label: point.label })
  }
  return [...seen.values()]
}

/**
 * Turns one sparse history into dense chart series, one per named entity.
 *
 * The payload omits a point entirely when an entity had no traffic in a bucket, so every gap
 * is filled with the `missing` value. That fill is the one place this page substitutes a
 * number the server did not send, and it is only ever the identity of "no traffic": 0 tokens
 * for the volume chart, 0% for the share chart.
 */
function densify<TPoint extends HistoryLikePoint>(options: {
  points: readonly TPoint[]
  buckets: readonly HistoryBucket[]
  names: readonly string[]
  nameOf: (point: TPoint) => string
  valueOf: (point: TPoint) => number
  missing: number
}): ChartSeries[] {
  const index = new Map<string, Map<string, number>>()
  for (const point of options.points) {
    const name = options.nameOf(point)
    const byBucket = index.get(name) ?? new Map<string, number>()
    byBucket.set(point.ts, options.valueOf(point))
    index.set(name, byBucket)
  }

  return options.names.map((name) => {
    const byBucket = index.get(name)
    const chartPoints: ChartPoint[] = options.buckets.map((bucket, position) => ({
      x: position,
      y: byBucket?.get(bucket.ts) ?? options.missing,
    }))
    return { name, points: chartPoints }
  })
}

/**
 * The axis label for an x position on a history chart.
 *
 * `LineChart` only passes a tick's ORDINAL as its second argument, and once the buckets
 * outnumber `xTickCount` it stops ticking on buckets at all: `sampleDomain` spaces the ticks
 * evenly across the domain instead. Labelling by that ordinal would print the first six dates
 * across a thirty-day plot — a time axis the data never had. The x value, on the other hand, IS
 * the bucket index, so rounding it always names a bucket that exists, at most half a bucket
 * away from where the tick sits. The accessible table asks with the exact integer x of each
 * bucket, so it stays exact either way.
 */
export function bucketLabelAt(labels: readonly string[], x: number): string {
  if (!Number.isFinite(x)) return ''
  return labels[Math.round(x)] ?? ''
}

export type HistoryChart = {
  series: ChartSeries[]
  buckets: HistoryBucket[]
  /** Series the server listed but the chart left out, so the UI can say how many. */
  omitted: number
}

/**
 * Token volume per model per bucket.
 *
 * The series order follows `models_history.models`, which the server already sorted by total
 * tokens descending (with the tail rolled into `Others`), so the top {@link HISTORY_SERIES_LIMIT}
 * entries are the biggest ones.
 */
export function modelVolumeChart(history: ModelHistorySeries | undefined): HistoryChart {
  if (history === undefined) return { series: [], buckets: [], omitted: 0 }

  const buckets = historyBuckets(history.points)
  const names = history.models.map((model) => model.name)
  const visible = names.slice(0, HISTORY_SERIES_LIMIT)

  return {
    series: densify({
      buckets,
      missing: 0,
      nameOf: (point) => point.model,
      names: visible,
      points: history.points,
      valueOf: (point) => point.tokens,
    }),
    buckets,
    omitted: Math.max(0, names.length - visible.length),
  }
}

/**
 * Vendor share per bucket, as a percentage.
 *
 * `share` arrives normalised within each bucket (the values at one `ts` sum to 1), so it is
 * multiplied by 100 for display and nothing is re-normalised here.
 */
export function vendorShareChart(history: VendorShareSeries | undefined): HistoryChart {
  if (history === undefined) return { series: [], buckets: [], omitted: 0 }

  const buckets = historyBuckets(history.points)
  const names = history.vendors.map((vendor) => vendor.name)
  const visible = names.slice(0, HISTORY_SERIES_LIMIT)

  return {
    series: densify({
      buckets,
      missing: 0,
      nameOf: (point) => point.vendor,
      names: visible,
      points: history.points,
      valueOf: (point) => point.share * 100,
    }),
    buckets,
    omitted: Math.max(0, names.length - visible.length),
  }
}

/**
 * Total tokens across the window, summed from the leaderboard rows.
 *
 * DERIVED: the payload has no grand total. `models` is capped at 20 rows server-side
 * (`rankingLeaderboardLimit`), so this is the total of the ranked models only, which is why
 * the UI labels it as such rather than as "all traffic".
 */
export function rankedTokenTotal(models: readonly RankedModel[]): number {
  return models.reduce((total, model) => total + (Number.isFinite(model.total_tokens) ? model.total_tokens : 0), 0)
}

/**
 * Share of the window covered by the ranked rows, 0..1.
 *
 * DERIVED: `share` is each model's fraction of ALL tokens, so summing the visible rows says how
 * much of the window the leaderboard actually accounts for. Below 1 means the tail was cut.
 */
export function rankedShareCovered(models: readonly RankedModel[]): number {
  return models.reduce((total, model) => total + (Number.isFinite(model.share) ? model.share : 0), 0)
}

/** Models with no rank in the preceding window. DERIVED: counts rows missing `previous_rank`. */
export function newEntrantCount(models: readonly RankedModel[]): number {
  return models.filter((model) => model.previous_rank === undefined).length
}
