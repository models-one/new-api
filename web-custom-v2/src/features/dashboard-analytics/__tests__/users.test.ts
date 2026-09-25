import { describe, expect, it } from 'vitest'

import { resolveDataWindow } from '@/features/dashboard-analytics/range'
import {
  aggregateByModel,
  aggregateByUser,
  buildUserTrends,
  foldRemainingModels,
  rankUsers,
  sumUsage,
  MODEL_SLICE_LIMIT,
} from '@/features/dashboard-analytics/users'
import type { QuotaDataPoint } from '@/lib/api/usage-data'

const HOUR = 3600

/**
 * `GET /api/data/users` fills only username, created_at and the three measures;
 * every other field of the struct is present on the wire but zero, exactly as
 * the live server returns it. The fixtures keep those zeroes.
 */
function userPoint(overrides: Partial<QuotaDataPoint>): QuotaDataPoint {
  return {
    id: 0,
    user_id: 0,
    username: 'root',
    model_name: '',
    created_at: 1_787_454_000,
    use_group: '',
    token_id: 0,
    channel_id: 0,
    node_name: '',
    token_used: 0,
    count: 0,
    quota: 0,
    ...overrides,
  }
}

describe('sumUsage and aggregateByUser', () => {
  const points = [
    userPoint({ username: 'root', quota: 300, token_used: 30, count: 3 }),
    userPoint({ username: 'root', quota: 100, token_used: 10, count: 1, created_at: 1_787_457_600 }),
    userPoint({ username: 'member', quota: 100, token_used: 90, count: 6 }),
  ]

  it('totals every row', () => {
    expect(sumUsage(points)).toEqual({ quota: 500, tokens: 130, requests: 10 })
  })

  it('collapses the hourly rows per user and ranks by spend', () => {
    const users = aggregateByUser(points)

    expect(users.map((user) => user.username)).toEqual(['root', 'member'])
    expect(users[0]).toMatchObject({ quota: 400, tokens: 40, requests: 4, share: 80 })
    expect(users[1]?.share).toBe(20)
  })

  it('keeps an unattributed row as an empty username instead of naming it', () => {
    const users = aggregateByUser([userPoint({ username: '', quota: 5 })])
    expect(users[0]?.username).toBe('')
  })

  it('reports zero share instead of dividing by zero when nothing was spent', () => {
    const users = aggregateByUser([userPoint({ username: 'root', quota: 0, count: 2 })])
    expect(users[0]?.share).toBe(0)
  })
})

describe('rankUsers', () => {
  const users = aggregateByUser([
    userPoint({ username: 'big-spender', quota: 900, token_used: 10, count: 1 }),
    userPoint({ username: 'chatty', quota: 100, token_used: 900, count: 90 }),
    userPoint({ username: 'idle', quota: 0, token_used: 0, count: 0 }),
  ])

  it('reorders when the measure changes rather than always ranking by spend', () => {
    expect(rankUsers(users, 'quota', 10).map((user) => user.username)).toEqual(['big-spender', 'chatty'])
    expect(rankUsers(users, 'tokens', 10).map((user) => user.username)).toEqual(['chatty', 'big-spender'])
    expect(rankUsers(users, 'requests', 10).map((user) => user.username)).toEqual(['chatty', 'big-spender'])
  })

  it('drops users contributing nothing to the measure', () => {
    expect(rankUsers(users, 'quota', 10).map((user) => user.username)).not.toContain('idle')
  })

  it('cuts to the requested Top-N', () => {
    expect(rankUsers(users, 'quota', 1).map((user) => user.username)).toEqual(['big-spender'])
  })
})

describe('buildUserTrends', () => {
  const end = 1_787_500_000
  const window = resolveDataWindow('24h', end)

  it('zero-fills every bucket so an idle hour is drawn as zero, not skipped', () => {
    const bucket = Math.floor((end - HOUR) / HOUR) * HOUR
    const trends = buildUserTrends(
      [userPoint({ username: 'root', created_at: bucket, quota: 42, token_used: 7, count: 2 })],
      ['root'],
      window,
    )

    const points = trends[0]?.points ?? []
    expect(points.length).toBeGreaterThan(20)
    expect(points.filter((point) => point.quota > 0)).toHaveLength(1)
    expect(points.find((point) => point.x === bucket)).toMatchObject({ quota: 42, tokens: 7, requests: 2 })
  })

  it('ignores rows for users outside the named set', () => {
    const bucket = Math.floor((end - HOUR) / HOUR) * HOUR
    const trends = buildUserTrends(
      [userPoint({ username: 'other', created_at: bucket, quota: 42 })],
      ['root'],
      window,
    )

    expect(trends).toHaveLength(1)
    expect(trends[0]?.points.every((point) => point.quota === 0)).toBe(true)
  })

  it('rolls hourly rows into local days for a window wider than two days', () => {
    const wide = resolveDataWindow('30d', end)
    const trends = buildUserTrends(
      [
        userPoint({ username: 'root', created_at: end - HOUR, quota: 10 }),
        userPoint({ username: 'root', created_at: end - 2 * HOUR, quota: 5 }),
      ],
      ['root'],
      wide,
    )

    expect(wide.bucket).toBe('day')
    const nonZero = trends[0]?.points.filter((point) => point.quota > 0) ?? []
    // Both hours fall on the same local day, so they land in one bucket.
    expect(nonZero).toHaveLength(1)
    expect(nonZero[0]?.quota).toBe(15)
  })
})

describe('aggregateByModel', () => {
  const points = [
    userPoint({ username: '', model_name: 'gpt-4o', quota: 600, token_used: 60, count: 6 }),
    userPoint({ username: '', model_name: 'gpt-4o', quota: 200, token_used: 20, count: 2 }),
    userPoint({ username: '', model_name: 'deepseek-chat', quota: 200, token_used: 500, count: 40 }),
  ]

  it('sums per model name and derives a share of the platform quota', () => {
    const models = aggregateByModel(points)

    expect(models.map((model) => model.model)).toEqual(['gpt-4o', 'deepseek-chat'])
    expect(models[0]).toMatchObject({ quota: 800, tokens: 80, requests: 8, share: 80 })
  })

  it('folds only what is past the slice limit, and keeps its measures', () => {
    const many = Array.from({ length: MODEL_SLICE_LIMIT + 2 }, (_, index) =>
      userPoint({ username: '', model_name: `model-${index}`, quota: 100 - index, count: 1 }),
    )
    const models = aggregateByModel(many)
    const rest = foldRemainingModels(models)

    expect(models).toHaveLength(MODEL_SLICE_LIMIT + 2)
    expect(rest?.quota).toBe(
      models.slice(MODEL_SLICE_LIMIT).reduce((sum, model) => sum + model.quota, 0),
    )
    expect(rest?.requests).toBe(2)
  })

  it('folds to null when nothing exceeds the slice limit', () => {
    expect(foldRemainingModels(aggregateByModel(points))).toBeNull()
  })
})
