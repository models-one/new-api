import { queryOptions } from '@tanstack/react-query'

import { getJson } from '@/lib/api/client'

/**
 * `GET /api/data/self` — one row PER MODEL PER HOUR. `created_at` is truncated to the hour.
 * Only user_id, username, model_name, created_at, count, quota and token_used are populated;
 * the remaining struct fields are always zero because the SELECT does not fill them.
 */
export type QuotaDataPoint = {
  id: number
  user_id: number
  username: string
  model_name: string
  created_at: number
  use_group: string
  token_id: number
  channel_id: number
  node_name: string
  token_used: number
  count: number
  quota: number
}

/** The server rejects any window wider than this with `success:false` and no data. */
export const MAX_DATA_RANGE_SECONDS = 2_592_000

export function clampDataRange(startSeconds: number, endSeconds: number): { start: number; end: number } {
  const end = Math.max(startSeconds, endSeconds)
  const start = Math.max(startSeconds, end - MAX_DATA_RANGE_SECONDS)
  return { start, end }
}

export function selfQuotaDataQuery(startSeconds: number, endSeconds: number) {
  const { start, end } = clampDataRange(startSeconds, endSeconds)
  return queryOptions({
    queryKey: ['data', 'self', start, end],
    queryFn: () =>
      getJson<QuotaDataPoint[]>('/api/data/self', {
        params: { start_timestamp: start, end_timestamp: end },
      }),
    staleTime: 60 * 1000,
  })
}

export type SeriesPoint = { x: number; requests: number; tokens: number; quota: number }

/** Collapses the per-model rows into one point per hour, which is what the volume chart plots. */
export function aggregateByHour(points: QuotaDataPoint[]): SeriesPoint[] {
  const byHour = new Map<number, SeriesPoint>()
  for (const point of points) {
    const existing = byHour.get(point.created_at)
    if (existing) {
      existing.requests += point.count
      existing.tokens += point.token_used
      existing.quota += point.quota
      continue
    }
    byHour.set(point.created_at, {
      x: point.created_at,
      requests: point.count,
      tokens: point.token_used,
      quota: point.quota,
    })
  }
  return [...byHour.values()].sort((a, b) => a.x - b.x)
}

export type ModelUsage = { model: string; requests: number; tokens: number; quota: number }

export function aggregateByModel(points: QuotaDataPoint[]): ModelUsage[] {
  const byModel = new Map<string, ModelUsage>()
  for (const point of points) {
    const existing = byModel.get(point.model_name)
    if (existing) {
      existing.requests += point.count
      existing.tokens += point.token_used
      existing.quota += point.quota
      continue
    }
    byModel.set(point.model_name, {
      model: point.model_name,
      requests: point.count,
      tokens: point.token_used,
      quota: point.quota,
    })
  }
  return [...byModel.values()].sort((a, b) => b.quota - a.quota)
}
