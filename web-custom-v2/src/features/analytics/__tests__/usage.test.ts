import { describe, expect, it } from 'vitest'

import { resolveAnalyticsWindow } from '@/features/analytics/range'
import {
  MODEL_SHARE_ROW_LIMIT,
  buildModelShares,
  buildVolumeSeries,
  foldRemainingShares,
  percentChange,
} from '@/features/analytics/usage'
import type { QuotaDataPoint } from '@/lib/api/usage-data'

const HOUR = 3600

/** One `GET /api/data/self` row; only the fields the handler actually fills matter. */
function point(overrides: Partial<QuotaDataPoint> = {}): QuotaDataPoint {
  return {
    id: 0,
    user_id: 1,
    username: 'root',
    model_name: 'gpt-4o',
    created_at: 1787400000,
    use_group: '',
    token_id: 0,
    channel_id: 0,
    node_name: '',
    token_used: 1000,
    count: 10,
    quota: 5000,
    ...overrides,
  }
}

describe('buildModelShares', () => {
  it('splits the window total across models and never exceeds 100 percent', () => {
    const shares = buildModelShares([
      point({ model_name: 'gpt-4o', token_used: 3000 }),
      point({ model_name: 'gpt-4o', token_used: 1000 }),
      point({ model_name: 'deepseek-chat', token_used: 4000 }),
      // A model that billed quota but recorded no tokens has no token share.
      point({ model_name: 'silent-model', token_used: 0, quota: 900 }),
    ])

    expect(shares.map((entry) => entry.model)).toEqual(['gpt-4o', 'deepseek-chat'])
    expect(shares.map((entry) => entry.share)).toEqual([50, 50])
    expect(shares.reduce((total, entry) => total + entry.share, 0)).toBeCloseTo(100, 10)
  })

  it('returns nothing rather than a zero row when the window recorded no tokens', () => {
    expect(buildModelShares([point({ token_used: 0 })])).toEqual([])
  })
})

describe('foldRemainingShares', () => {
  it('adds up the models past the row limit instead of dropping them', () => {
    const shares = buildModelShares(
      Array.from({ length: MODEL_SHARE_ROW_LIMIT + 3 }, (_unused, index) =>
        point({ model_name: `model-${index}`, token_used: 1000 })),
    )
    const remainder = foldRemainingShares(shares)

    expect(shares).toHaveLength(MODEL_SHARE_ROW_LIMIT + 3)
    expect(remainder?.tokens).toBe(3000)
    expect(remainder?.share).toBeCloseTo((3 / (MODEL_SHARE_ROW_LIMIT + 3)) * 100, 10)
  })

  it('has no remainder row when every model already has one', () => {
    expect(foldRemainingShares(buildModelShares([point()]))).toBeNull()
  })
})

describe('buildVolumeSeries', () => {
  it('keeps empty hours at zero and ignores rows outside the window', () => {
    const end = 1787400000
    const window = resolveAnalyticsWindow('24h', end)
    const series = buildVolumeSeries(
      [
        point({ created_at: end - HOUR, count: 4, token_used: 40, quota: 400 }),
        point({ created_at: end - 2 * HOUR, count: 6, token_used: 60, quota: 600 }),
        // Older than the window start, so the server would not return it either.
        point({ created_at: end - 30 * HOUR, count: 99 }),
      ],
      window,
    )

    expect(series).toHaveLength(25)
    expect(series.at(-1)?.x).toBe(end)
    expect(series.at(-2)).toEqual({ x: end - HOUR, requests: 4, tokens: 40, quota: 400 })
    expect(series.at(-3)).toEqual({ x: end - 2 * HOUR, requests: 6, tokens: 60, quota: 600 })
    expect(series.filter((bucket) => bucket.requests > 0)).toHaveLength(2)
    expect(series.reduce((total, bucket) => total + bucket.requests, 0)).toBe(10)
  })
})

describe('percentChange', () => {
  it('has no percentage to report when the baseline window is empty', () => {
    expect(percentChange(120, 0)).toBeNull()
  })

  it('measures the change against the baseline window', () => {
    expect(percentChange(120, 100)).toBeCloseTo(20, 10)
    expect(percentChange(80, 100)).toBeCloseTo(-20, 10)
  })
})
