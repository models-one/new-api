import { queryOptions } from '@tanstack/react-query'

import { getJson } from '@/lib/api/client'
import { clampDataRange, type QuotaDataPoint } from '@/lib/api/usage-data'

/**
 * One row of the two flow endpoints (model/usedata_flow.go `FlowQuotaData`).
 *
 * WHICH KEYS ARRIVE DEPENDS ON THE CALLER'S ROLE, because the SELECT list does
 * (model/usedata_flow.go, verified live and by `TestGetFlowQuotaDataUsesQuotaDataRoleSpecificDimensions`):
 *
 *   `/api/data/flow/self`            token_id, use_group, model_name
 *   `/api/data/flow`, role 10..99    user_id, username, use_group, model_name, channel_id
 *   `/api/data/flow`, role >= 100    the admin set plus node_name and token_id
 *
 * Every id field is `omitempty`, so a zero id is ABSENT from the JSON rather
 * than present as 0 — a live `/api/data/flow/self` row for usage with no token
 * carries neither `token_id` nor `token_name`. `token_name` and `channel_name`
 * are resolved by a second lookup server-side and come back EMPTY for a
 * soft-deleted token or a removed channel, while the id stays: that pair means
 * "deleted", not "unknown", and the console labels it accordingly.
 *
 * Both flow endpoints filter `use_group <> ''`, so their totals are a SUBSET of
 * what `/api/data/self` and `/api/data/` report for the same window.
 */
export type FlowQuotaRow = {
  user_id?: number
  username?: string
  node_name?: string
  token_id?: number
  token_name?: string
  use_group: string
  channel_id?: number
  channel_name?: string
  model_name: string
  token_used: number
  count: number
  quota: number
}

/**
 * `start_timestamp` and `end_timestamp` are BOTH REQUIRED and must parse to a
 * value greater than zero on the flow routes: `parseFlowQuotaTimeRange`
 * (controller/usedata.go) answers `{"success":false,"message":"invalid start_timestamp"}`
 * otherwise. Verified live.
 */
function flowParams(start: number, end: number) {
  return { end_timestamp: end, start_timestamp: start }
}

/** The page renders its own error surface, so neither the toast nor the interceptor fires. */
const silent = { skipBusinessError: true, skipErrorHandler: true } as const

/**
 * `GET /api/data/flow/self` — the signed-in user's own traffic, grouped
 * server-side by token_id + use_group + model_name. Subject to the same 30 day
 * span ceiling as `/api/data/self` (`GetUserFlowQuotaDates`), so the window goes
 * through `clampDataRange` first.
 */
export function selfFlowQuery(startSeconds: number, endSeconds: number) {
  const { start, end } = clampDataRange(startSeconds, endSeconds)
  return queryOptions({
    enabled: start > 0 && end > 0,
    queryKey: ['dashboard-analytics', 'flow', 'self', start, end] as const,
    queryFn: () => getJson<FlowQuotaRow[]>('/api/data/flow/self', { params: flowParams(start, end), ...silent }),
    staleTime: 60 * 1000,
  })
}

/**
 * `GET /api/data/flow` — every user's traffic. `middleware.AdminAuth()`, i.e.
 * role >= 10.
 *
 * `username` is an EXACT match server-side (`Where("username = ?")`), not a
 * LIKE: a partial name returns an empty array, which is verified live.
 *
 * NOTE: `GetAllFlowQuotaDates` does NOT enforce the 30 day ceiling — a 31 day
 * window returns data here while the same window on `/flow/self` is refused.
 * The console clamps anyway so one range control can drive both scopes.
 */
export function allFlowQuery(startSeconds: number, endSeconds: number, username: string) {
  const { start, end } = clampDataRange(startSeconds, endSeconds)
  const exactUsername = username.trim()
  return queryOptions({
    enabled: start > 0 && end > 0,
    queryKey: ['dashboard-analytics', 'flow', 'all', exactUsername, start, end] as const,
    queryFn: () =>
      getJson<FlowQuotaRow[]>('/api/data/flow', {
        params: exactUsername === '' ? flowParams(start, end) : { ...flowParams(start, end), username: exactUsername },
        ...silent,
      }),
    staleTime: 60 * 1000,
  })
}

/**
 * `GET /api/data/users` — `GetQuotaDataGroupByUser`, admin only. One row per
 * username per hour bucket.
 *
 * The SELECT is `username, created_at, sum(count), sum(quota), sum(token_used)`,
 * so on the wire `user_id`, `model_name`, `use_group`, `token_id`, `channel_id`
 * and `node_name` are all present but ALWAYS ZERO/EMPTY. Verified live: every
 * row of the seeded instance reports `"user_id":0` and `"model_name":""`. The
 * username is therefore the only identity this endpoint offers, and no per-user
 * model breakdown can be built from it.
 */
export function usersQuotaQuery(startSeconds: number, endSeconds: number) {
  const { start, end } = clampDataRange(startSeconds, endSeconds)
  return queryOptions({
    enabled: start > 0 && end > 0,
    queryKey: ['dashboard-analytics', 'data', 'users', start, end] as const,
    queryFn: () => getJson<QuotaDataPoint[]>('/api/data/users', { params: flowParams(start, end), ...silent }),
    staleTime: 60 * 1000,
  })
}

/**
 * `GET /api/data/` — `GetAllQuotaDates`, admin only. One row per model per hour
 * across every user, with `username` empty.
 *
 * Passing `username` switches the handler to `GetQuotaDataByUsername`, which
 * groups by model AND fills `user_id`/`username`. Exact match, like the flow
 * route.
 */
export function allQuotaQuery(startSeconds: number, endSeconds: number, username = '') {
  const { start, end } = clampDataRange(startSeconds, endSeconds)
  const exactUsername = username.trim()
  return queryOptions({
    enabled: start > 0 && end > 0,
    queryKey: ['dashboard-analytics', 'data', 'all', exactUsername, start, end] as const,
    queryFn: () =>
      getJson<QuotaDataPoint[]>('/api/data/', {
        params: exactUsername === '' ? flowParams(start, end) : { ...flowParams(start, end), username: exactUsername },
        ...silent,
      }),
    staleTime: 60 * 1000,
  })
}
