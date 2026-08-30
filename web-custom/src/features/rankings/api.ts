import { queryOptions } from '@tanstack/react-query'

import { getJson } from '@/lib/api/client'
import type { ApiRequestConfig } from '@/lib/http-client'

/**
 * The rankings snapshot, `GET /api/rankings?period=…`.
 *
 * Every field below was read off the live seeded backend and cross-checked against the Go
 * structs in `service/rankings.go`. Fields tagged `omitempty` there are optional here; nothing
 * else is. Notably ABSENT from the payload, and therefore absent from this UI: any per-category
 * breakdown, request counts, spend, latency, or model metadata beyond the vendor name.
 */

/** The four windows `rankingConfig` accepts. Anything else answers 400. */
export const RANKING_PERIODS = ['today', 'week', 'month', 'year'] as const

export type RankingPeriod = (typeof RANKING_PERIODS)[number]

export function isRankingPeriod(value: unknown): value is RankingPeriod {
  return typeof value === 'string' && (RANKING_PERIODS as readonly string[]).includes(value)
}

export const DEFAULT_RANKING_PERIOD: RankingPeriod = 'week'

/**
 * The server hardcodes `Category: "all"` on every row (`service/rankings.go`). It is carried
 * through so the type matches the wire, but there is no category dimension to filter on and
 * this UI does not pretend there is.
 */
export type RankedModel = {
  rank: number
  /** Absent when the model had no traffic in the preceding window — a new entrant. */
  previous_rank?: number
  model_name: string
  vendor: string
  /** Absent for models whose vendor the gateway does not recognise. */
  vendor_icon?: string
  category: string
  total_tokens: number
  /** Fraction of all tokens in the window, 0..1. */
  share: number
  /** Percent change in tokens against the preceding window. 100 also means "new" — see below. */
  growth_pct: number
}

export type RankedVendor = {
  rank: number
  vendor: string
  vendor_icon?: string
  total_tokens: number
  share: number
  growth_pct: number
  models_count: number
  top_model: string
}

export type RankingMover = {
  model_name: string
  vendor: string
  vendor_icon?: string
  /** `previous_rank - rank`: positive climbed, negative dropped. Never 0 (the server skips it). */
  rank_delta: number
  current_rank: number
  growth_pct: number
}

export type ModelHistoryPoint = {
  /** RFC3339 UTC bucket start, e.g. `2026-08-22T00:00:00Z`. */
  ts: string
  /** Server-rendered axis label: `Jan 2` for day/week buckets, `15:04` for the hourly window. */
  label: string
  model: string
  vendor: string
  tokens: number
}

export type ModelHistorySeries = {
  /**
   * SPARSE. A model with no traffic in a bucket has no point for it — the server emits nothing
   * rather than a zero. Anything charting this must fill the gaps itself.
   */
  points: ModelHistoryPoint[]
  /** Top 10 by tokens; the tail is rolled into one entry literally named `Others`. */
  models: Array<{ name: string; vendor: string; total: number }>
  buckets: number
}

export type VendorSharePoint = {
  ts: string
  label: string
  vendor: string
  /** Normalised WITHIN the bucket: the shares at one `ts` sum to 1. */
  share: number
  tokens: number
}

export type VendorShareSeries = {
  /** Sparse, like `ModelHistorySeries.points`. */
  points: VendorSharePoint[]
  /** Top 5 by tokens; the tail is rolled into one entry literally named `Others`. */
  vendors: Array<{ name: string; total: number; share: number }>
  buckets: number
}

/** `rankingLeaderboardLimit` in `service/rankings.go`: the row cap on `models`. */
export const RANKED_MODEL_LIMIT = 20

export type RankingsSnapshot = {
  /** Capped at {@link RANKED_MODEL_LIMIT} rows server-side (`rankingLeaderboardLimit`). */
  models: RankedModel[]
  vendors: RankedVendor[]
  /** Capped at 6 (`rankingMoverLimit`). Empty when no model has a previous rank. */
  top_movers: RankingMover[]
  top_droppers: RankingMover[]
  models_history: ModelHistorySeries
  vendor_share_history: VendorShareSeries
}

/**
 * The literal name the server gives the rolled-up tail series in both histories.
 * `service/rankings.go` calls it `rankingOthersLabel`; it is an English constant on the wire,
 * so the UI translates it at the point of display rather than treating it as a real vendor.
 */
export const RANKING_OTHERS_LABEL = 'Others'

/**
 * The request config every request this public surface makes has to carry.
 *
 * `lib/http-client` answers a 401 by refreshing the session and, when that fails, toasting
 * "Session expired!" and hard-navigating to the legacy sign-in page. That is right inside the
 * console and wrong here: an operator who sets `rankings.requireAuth` makes this endpoint
 * answer 401 to anonymous visitors, and the console handling would throw them off the public
 * page before it could render its own sign-in notice.
 *
 * - `skipAuthRefresh` keeps a 401 a plain rejection instead of a redirect.
 * - `skipErrorHandler` keeps the toast off a page that renders every failure inline.
 * - `skipBusinessError` does the same for a 200 carrying `success: false`.
 */
export const PUBLIC_REQUEST: ApiRequestConfig = {
  skipAuthRefresh: true,
  skipErrorHandler: true,
  skipBusinessError: true,
}

/**
 * `GET /api/rankings`, read anonymously.
 *
 * The response nests the snapshot under `data`, so `getJson` (which unwraps the envelope) is
 * correct here — unlike `/api/pricing`, which needs `getRawJson`. The server caches each period
 * for five minutes (`rankingCacheTTL`), so the client matches that staleTime rather than
 * re-asking for a snapshot it knows cannot have moved.
 */
export function publicRankingsQuery(period: RankingPeriod) {
  return queryOptions({
    queryKey: ['rankings', 'public', period],
    queryFn: () =>
      getJson<RankingsSnapshot>('/api/rankings', { ...PUBLIC_REQUEST, params: { period } }),
    staleTime: 5 * 60 * 1000,
  })
}
