import { queryOptions } from '@tanstack/react-query'

import { getJson } from '@/lib/api/client'
import { clampDataRange } from '@/lib/api/usage-data'

/**
 * One row of `GET /api/data/flow/self` (model/usedata_flow.go `FlowQuotaData`), grouped
 * server-side by token_id + use_group + model_name for the calling user.
 *
 * This binding lives in the feature rather than in `@/lib/api` because the shared data
 * layer has no module for the flow endpoint. Move it there if a second page needs it.
 *
 * Shape verified against the live server: for a non-admin caller the payload carries
 * only these keys. `token_id` and `token_name` are `omitempty`, so BOTH are absent from
 * the JSON when the usage carries no token id — and a row can arrive with a `token_id`
 * and no name, which the backend does deliberately for tokens that were deleted.
 */
export type FlowQuotaRow = {
  token_id?: number
  token_name?: string
  use_group: string
  model_name: string
  token_used: number
  count: number
  quota: number
}

/**
 * `start_timestamp` and `end_timestamp` are BOTH REQUIRED and must be greater than 0:
 * the handler answers `{"success":false,"message":"invalid start_timestamp"}` otherwise
 * (verified live). The same 30 day span ceiling as `/api/data/self` applies, so the
 * range goes through `clampDataRange` before it is sent.
 */
export function selfFlowQuery(startSeconds: number, endSeconds: number) {
  const { start, end } = clampDataRange(startSeconds, endSeconds)
  return queryOptions({
    enabled: start > 0 && end > 0,
    queryKey: ['data', 'flow', 'self', start, end],
    queryFn: () =>
      getJson<FlowQuotaRow[]>('/api/data/flow/self', {
        params: { end_timestamp: end, start_timestamp: start },
      }),
    staleTime: 60 * 1000,
  })
}

export type KeySpend = {
  /** Stable React key; the token id, or `unattributed` for the no-token bucket. */
  id: string
  /** 0 when the row carried no token id at all. */
  tokenId: number
  /** Empty when the server could not resolve a name, i.e. the token was deleted. */
  name: string
  requests: number
  tokens: number
  quota: number
  /** Percentage of the attributable quota in this response. Derived in this console. */
  share: number
}

/** Sum of the quota the flow endpoint could attribute for the window. */
export function sumFlowQuota(rows: readonly FlowQuotaRow[]): number {
  return rows.reduce((total, row) => total + row.quota, 0)
}

/**
 * Collapses the per-model rows into one entry per API key. `share` is this console's
 * own arithmetic — the endpoint reports no percentages — and is taken against the sum
 * of these rows, which is the only total the same response can vouch for.
 */
export function aggregateByToken(rows: readonly FlowQuotaRow[]): KeySpend[] {
  const byToken = new Map<number, KeySpend>()

  for (const row of rows) {
    const tokenId = row.token_id ?? 0
    const existing = byToken.get(tokenId)
    if (existing) {
      existing.requests += row.count
      existing.tokens += row.token_used
      existing.quota += row.quota
      // Only some of a key's rows may carry the name; keep the first one that does.
      if (!existing.name && row.token_name) existing.name = row.token_name
      continue
    }
    byToken.set(tokenId, {
      id: tokenId > 0 ? String(tokenId) : 'unattributed',
      name: row.token_name ?? '',
      quota: row.quota,
      requests: row.count,
      share: 0,
      tokens: row.token_used,
      tokenId,
    })
  }

  const total = sumFlowQuota(rows)
  return [...byToken.values()]
    .map((entry) => ({ ...entry, share: total > 0 ? (entry.quota / total) * 100 : 0 }))
    .sort((left, right) => right.quota - left.quota)
}
