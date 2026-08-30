import { describe, expect, it } from 'vitest'

import type { ModelHistorySeries, RankedModel, VendorShareSeries } from '@/features/rankings/api'
import {
  HISTORY_SERIES_LIMIT,
  bucketLabelAt,
  formatGrowth,
  formatRankDelta,
  formatShare,
  historyBuckets,
  modelMovement,
  modelVolumeChart,
  newEntrantCount,
  rankedShareCovered,
  rankedTokenTotal,
  vendorMovement,
  vendorShareChart,
} from '@/features/rankings/rankings-presentation'

/** Field for field, rows a live `GET /api/rankings?period=week` returned from the seeded backend. */
const liveModels: RankedModel[] = [
  {
    rank: 1,
    previous_rank: 3,
    model_name: 'gpt-4o-mini',
    vendor: 'OpenAI',
    vendor_icon: 'OpenAI',
    category: 'all',
    total_tokens: 2737699,
    share: 0.267,
    growth_pct: 24.5565,
  },
  {
    rank: 4,
    previous_rank: 1,
    model_name: 'claude-sonnet-4',
    vendor: 'Unknown',
    category: 'all',
    total_tokens: 2390384,
    share: 0.2331,
    growth_pct: 2.1791,
  },
  {
    // The live payload really does omit `previous_rank` here, and pairs it with growth_pct 100.
    rank: 5,
    model_name: 'orphan-model',
    vendor: 'Unknown',
    category: 'all',
    total_tokens: 555,
    share: 0.0001,
    growth_pct: 100,
  },
]

describe('modelMovement', () => {
  it('calls a row with no previous rank NEW rather than "+100%"', () => {
    // rankingGrowthPct returns 100 whenever the previous window was empty, so the percentage
    // there is not a measurement. Only previous_rank tells the two apart.
    const orphan = liveModels[2]
    expect(orphan).toBeDefined()
    expect(orphan?.growth_pct).toBe(100)
    expect(modelMovement({ previous_rank: undefined, growth_pct: 100 })).toEqual({ kind: 'new' })
  })

  it('reports a real measurement when the row does have a previous rank', () => {
    expect(modelMovement({ previous_rank: 3, growth_pct: 24.5565 })).toEqual({
      kind: 'up',
      growthPct: 24.5565,
    })
    expect(modelMovement({ previous_rank: 1, growth_pct: -8.5 })).toEqual({
      kind: 'down',
      growthPct: -8.5,
    })
  })

  it('treats an exactly-zero or non-finite growth as unchanged', () => {
    expect(modelMovement({ previous_rank: 2, growth_pct: 0 })).toEqual({ kind: 'flat' })
    expect(modelMovement({ previous_rank: 2, growth_pct: Number.NaN })).toEqual({ kind: 'flat' })
  })
})

describe('vendorMovement', () => {
  it('never reports "new", because vendor rows carry no previous rank to prove it', () => {
    expect(vendorMovement(100)).toEqual({ kind: 'up', growthPct: 100 })
    expect(vendorMovement(0)).toEqual({ kind: 'flat' })
    expect(vendorMovement(-19.3)).toEqual({ kind: 'down', growthPct: -19.3 })
  })
})

describe('formatting', () => {
  it('signs growth and drops the decimal only past 100%', () => {
    expect(formatGrowth(24.5565)).toBe('+24.6%')
    expect(formatGrowth(-3.14)).toBe('−3.1%')
    expect(formatGrowth(157.9)).toBe('+158%')
  })

  it('collapses a share too small to render rather than showing 0%', () => {
    // The live `orphan-model` row has share 0.0001.
    expect(formatShare(0.0001)).toBe('<0.1%')
    expect(formatShare(0.267)).toBe('26.7%')
    expect(formatShare(0.0059)).toBe('0.59%')
    expect(formatShare(0)).toBe('0%')
  })

  it('signs a rank delta in places moved', () => {
    expect(formatRankDelta(2)).toBe('+2')
    expect(formatRankDelta(-3)).toBe('−3')
  })
})

describe('derived leaderboard totals', () => {
  it('sums only the ranked rows, which is all the payload offers', () => {
    expect(rankedTokenTotal(liveModels)).toBe(2737699 + 2390384 + 555)
    expect(rankedShareCovered(liveModels)).toBeCloseTo(0.5002, 4)
    expect(newEntrantCount(liveModels)).toBe(1)
  })

  it('reports zero rather than NaN for an empty leaderboard', () => {
    expect(rankedTokenTotal([])).toBe(0)
    expect(rankedShareCovered([])).toBe(0)
    expect(newEntrantCount([])).toBe(0)
  })
})

describe('history charts', () => {
  /**
   * The live payload is SPARSE: `deepseek-chat` has no point in the first bucket because it had
   * no traffic then, and the server omits the row entirely instead of sending a zero.
   */
  const history: ModelHistorySeries = {
    buckets: 2,
    models: [
      { name: 'gpt-4o-mini', vendor: 'OpenAI', total: 2737699 },
      { name: 'deepseek-chat', vendor: 'Unknown', total: 2623611 },
    ],
    points: [
      { ts: '2026-08-22T00:00:00Z', label: 'Aug 22', model: 'gpt-4o-mini', vendor: 'OpenAI', tokens: 100031 },
      { ts: '2026-08-23T00:00:00Z', label: 'Aug 23', model: 'gpt-4o-mini', vendor: 'OpenAI', tokens: 265515 },
      { ts: '2026-08-23T00:00:00Z', label: 'Aug 23', model: 'deepseek-chat', vendor: 'Unknown', tokens: 320658 },
    ],
  }

  it('collapses the points into one bucket per timestamp, keeping the server label', () => {
    expect(historyBuckets(history.points)).toEqual([
      { ts: '2026-08-22T00:00:00Z', label: 'Aug 22' },
      { ts: '2026-08-23T00:00:00Z', label: 'Aug 23' },
    ])
  })

  it('fills a missing bucket with zero so the series stay aligned', () => {
    const chart = modelVolumeChart(history)

    expect(chart.series).toHaveLength(2)
    expect(chart.series[0]?.points).toEqual([
      { x: 0, y: 100031 },
      { x: 1, y: 265515 },
    ])
    // deepseek-chat has no point at all in the first bucket.
    expect(chart.series[1]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 320658 },
    ])
    expect(chart.omitted).toBe(0)
  })

  it('caps the drawn series and reports how many it left out', () => {
    const many: ModelHistorySeries = {
      buckets: 1,
      models: Array.from({ length: HISTORY_SERIES_LIMIT + 3 }, (_unused, index) => ({
        name: `model-${index}`,
        vendor: 'Unknown',
        total: 100 - index,
      })),
      points: [{ ts: 'a', label: 'A', model: 'model-0', vendor: 'Unknown', tokens: 5 }],
    }

    const chart = modelVolumeChart(many)
    expect(chart.series).toHaveLength(HISTORY_SERIES_LIMIT)
    expect(chart.omitted).toBe(3)
  })

  it('scales the per-bucket vendor share to a percentage without renormalising', () => {
    const shares: VendorShareSeries = {
      buckets: 1,
      vendors: [
        { name: 'Unknown', total: 7515330, share: 0.733 },
        { name: 'OpenAI', total: 2737699, share: 0.267 },
      ],
      points: [
        { ts: '2026-08-22T00:00:00Z', label: 'Aug 22', vendor: 'Unknown', share: 0.6649, tokens: 198492 },
        { ts: '2026-08-22T00:00:00Z', label: 'Aug 22', vendor: 'OpenAI', share: 0.3351, tokens: 100031 },
      ],
    }

    const chart = vendorShareChart(shares)
    expect(chart.series[0]?.points[0]?.y).toBeCloseTo(66.49, 6)
    expect(chart.series[1]?.points[0]?.y).toBeCloseTo(33.51, 6)
  })

  it('returns nothing to draw when the snapshot has not arrived', () => {
    expect(modelVolumeChart(undefined)).toEqual({ series: [], buckets: [], omitted: 0 })
    expect(vendorShareChart(undefined)).toEqual({ series: [], buckets: [], omitted: 0 })
  })
})

describe('bucketLabelAt', () => {
  const labels = ['Aug 1', 'Aug 2', 'Aug 3', 'Aug 4']

  it('names the nearest real bucket for a tick sampled between two of them', () => {
    // `LineChart` ticks at evenly spaced fractions of the domain once the buckets outnumber the
    // tick count, so the formatter is asked about x values that fall between buckets.
    expect(bucketLabelAt(labels, 0)).toBe('Aug 1')
    expect(bucketLabelAt(labels, 1.2)).toBe('Aug 2')
    expect(bucketLabelAt(labels, 2.6)).toBe('Aug 4')
    expect(bucketLabelAt(labels, 3)).toBe('Aug 4')
  })

  it('renders nothing rather than a wrong date when the tick has no bucket', () => {
    expect(bucketLabelAt(labels, 4)).toBe('')
    expect(bucketLabelAt(labels, -1)).toBe('')
    expect(bucketLabelAt(labels, Number.NaN)).toBe('')
    expect(bucketLabelAt([], 0)).toBe('')
  })
})
