import { describe, expect, it } from 'vitest'

import type { FlowQuotaRow } from '@/features/dashboard-analytics/api'
import {
  countActiveFilters,
  filterFlowRows,
  flowNodeAt,
  flowPaths,
  flowStageBreakdown,
  flowTotals,
  visibleFlowStages,
} from '@/features/dashboard-analytics/flow'

/**
 * Verbatim rows from `GET /api/data/flow/self` on the dev server, including the
 * final one, which arrives with NEITHER `token_id` NOR `token_name` because both
 * are `omitempty` and the underlying usage carried no token.
 */
const selfRows: FlowQuotaRow[] = [
  {
    token_id: 1,
    token_name: 'Production Router',
    use_group: 'default',
    model_name: 'gpt-4o',
    token_used: 1_018_520,
    count: 411,
    quota: 2_383_394,
  },
  {
    token_id: 2,
    token_name: 'Cost Optimized',
    use_group: 'default',
    model_name: 'gpt-4o',
    token_used: 768_969,
    count: 321,
    quota: 1_814_167,
  },
  {
    token_id: 1,
    token_name: 'Production Router',
    use_group: 'default',
    model_name: 'claude-sonnet-4',
    token_used: 831_795,
    count: 378,
    quota: 1_495_041,
  },
  {
    use_group: 'default',
    model_name: 'orphan-model',
    token_used: 555,
    count: 3,
    quota: 777,
  },
]

describe('visibleFlowStages', () => {
  it('keeps only the dimensions the response actually filled', () => {
    // The self payload names a key, a group and a model — never a user, node or channel.
    expect(visibleFlowStages(selfRows)).toEqual(['token', 'group', 'model'])
  })

  it('drops a stage the payload declares but never names, such as root node_name', () => {
    const rootRow: FlowQuotaRow = {
      user_id: 1,
      username: 'root',
      node_name: '',
      token_id: 1,
      token_name: 'Production Router',
      use_group: 'default',
      channel_id: 1,
      channel_name: 'east',
      model_name: 'gpt-4o',
      token_used: 10,
      count: 1,
      quota: 100,
    }

    expect(visibleFlowStages([rootRow])).toEqual(['user', 'token', 'group', 'model', 'channel'])
  })

  it('returns nothing for an empty response rather than inventing columns', () => {
    expect(visibleFlowStages([])).toEqual([])
  })
})

describe('flowNodeAt', () => {
  it('separates a deleted key from an unattributed one', () => {
    // `fillFlowTokenNames` leaves the name empty for a soft-deleted token but
    // keeps the id; a row with no token at all reports neither.
    const deleted = flowNodeAt({ ...selfRows[0], token_name: '' } as FlowQuotaRow, 'token')
    expect(deleted).toMatchObject({ id: 'token:1', name: '', refId: 1 })

    const unattributed = flowNodeAt(selfRows[3] as FlowQuotaRow, 'token')
    expect(unattributed).toMatchObject({ id: 'token:none', name: '', refId: 0 })
  })

  it('collapses rows for the same entity onto one node id', () => {
    expect(flowNodeAt(selfRows[0] as FlowQuotaRow, 'token').id).toBe(
      flowNodeAt(selfRows[2] as FlowQuotaRow, 'token').id,
    )
  })
})

describe('flowTotals', () => {
  it('sums the three measures across every row', () => {
    expect(flowTotals(selfRows)).toEqual({
      quota: 2_383_394 + 1_814_167 + 1_495_041 + 777,
      tokens: 1_018_520 + 768_969 + 831_795 + 555,
      requests: 411 + 321 + 378 + 3,
    })
  })

  it('answers zeroes for an empty response', () => {
    expect(flowTotals([])).toEqual({ quota: 0, tokens: 0, requests: 0 })
  })
})

describe('flowStageBreakdown', () => {
  it('groups by node and ranks by quota', () => {
    const breakdown = flowStageBreakdown(selfRows, 'token')

    expect(breakdown.nodes.map((node) => node.id)).toEqual(['token:1', 'token:2', 'token:none'])
    // Key 1 appears in two rows and its measures add up.
    expect(breakdown.nodes[0]).toMatchObject({
      quota: 2_383_394 + 1_495_041,
      requests: 411 + 378,
      tokens: 1_018_520 + 831_795,
    })
  })

  it('derives share against the rows it covers, summing to 100', () => {
    const breakdown = flowStageBreakdown(selfRows, 'model')
    const total = breakdown.nodes.reduce((sum, node) => sum + node.share, 0)
    expect(total).toBeCloseTo(100, 6)
  })

  it('applies other stages filters but never its own', () => {
    // Filtering to key 1 must narrow the MODEL split...
    const models = flowStageBreakdown(selfRows, 'model', { token: 'token:1' })
    expect(models.nodes.map((node) => node.id)).toEqual(['model:gpt-4o', 'model:claude-sonnet-4'])

    // ...while the KEY split still offers every key, so the choice stays changeable.
    const tokens = flowStageBreakdown(selfRows, 'token', { token: 'token:1' })
    expect(tokens.nodes.map((node) => node.id)).toEqual(['token:1', 'token:2', 'token:none'])
  })

  it('reports an empty node list when a filter excludes everything', () => {
    expect(flowStageBreakdown(selfRows, 'model', { group: 'group:vip' }).nodes).toEqual([])
  })
})

describe('filterFlowRows', () => {
  it('returns every row when no filter is set', () => {
    expect(filterFlowRows(selfRows, {})).toHaveLength(selfRows.length)
  })

  it('requires every active filter to match', () => {
    expect(filterFlowRows(selfRows, { token: 'token:1', model: 'model:gpt-4o' })).toHaveLength(1)
    expect(filterFlowRows(selfRows, { token: 'token:2', model: 'model:claude-sonnet-4' })).toHaveLength(0)
  })

  it('ignores a filter whose value was cleared to an empty string', () => {
    expect(filterFlowRows(selfRows, { token: '' })).toHaveLength(selfRows.length)
    expect(countActiveFilters({ token: '', model: 'model:gpt-4o' })).toBe(1)
  })
})

describe('flowPaths', () => {
  const stages = visibleFlowStages(selfRows)

  it('produces one path per server row when every stage is visible', () => {
    expect(flowPaths(selfRows, stages)).toHaveLength(selfRows.length)
  })

  it('re-aggregates rows that collapse once a stage is hidden', () => {
    // Dropping the key stage merges the two gpt-4o rows into one path.
    const paths = flowPaths(selfRows, ['group', 'model'])
    const gpt = paths.find((path) => path.key === 'group:default > model:gpt-4o')

    expect(paths).toHaveLength(3)
    expect(gpt?.quota).toBe(2_383_394 + 1_814_167)
    expect(gpt?.requests).toBe(411 + 321)
  })

  it('orders by quota and derives share against the filtered rows', () => {
    const paths = flowPaths(selfRows, stages, { token: 'token:1' })

    expect(paths.map((path) => path.quota)).toEqual([2_383_394, 1_495_041])
    expect(paths.reduce((sum, path) => sum + path.share, 0)).toBeCloseTo(100, 6)
  })

  it('answers an empty list rather than throwing when the response is empty', () => {
    expect(flowPaths([], stages)).toEqual([])
  })
})

describe('flowPaths with no visible stage', () => {
  it('reports no path rather than one unlabelled row claiming the whole window', () => {
    // A response with no named dimension at all cannot describe a path, and a
    // single row carrying every measure would read as one.
    expect(flowPaths(selfRows, [])).toEqual([])
  })
})
