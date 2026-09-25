import { aggregateByModel, type QuotaDataPoint } from '@/lib/api/usage-data'

export type UsageTotals = {
  requests: number
  tokens: number
  /** Raw quota units; divide by `quota_per_unit` before showing it as money. */
  quota: number
}

export type ModelSpend = UsageTotals & {
  model: string
  /** Percentage of the window's quota, 0..100. Derived in this console. */
  share: number
}

/**
 * Per-model spend for the charted window together with the window's totals.
 *
 * Both come out of the same `/api/data/self` rows in one pass, so the shares are
 * guaranteed to be taken against the very total the page prints next to them.
 */
export function buildModelSpend(points: readonly QuotaDataPoint[]): {
  models: ModelSpend[]
  totals: UsageTotals
} {
  const aggregated = aggregateByModel([...points])
  const totals = aggregated.reduce<UsageTotals>(
    (sum, model) => ({
      quota: sum.quota + model.quota,
      requests: sum.requests + model.requests,
      tokens: sum.tokens + model.tokens,
    }),
    { quota: 0, requests: 0, tokens: 0 },
  )

  const models = aggregated.map((model) => ({
    model: model.model,
    quota: model.quota,
    requests: model.requests,
    share: totals.quota > 0 ? (model.quota / totals.quota) * 100 : 0,
    tokens: model.tokens,
  }))

  return { models, totals }
}
