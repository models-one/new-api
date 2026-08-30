import { describe, expect, it } from 'vitest'

import {
  parseRateLimitGroups,
  removeRateLimitEntry,
  serializeRateLimitGroups,
  upsertRateLimitEntry,
  validateRateLimitEntry,
} from '@/features/system-settings/auth-security/rate-limit-groups'

describe('parseRateLimitGroups', () => {
  it('reads the seeded {} as no overrides rather than as a broken value', () => {
    expect(parseRateLimitGroups('{}')).toEqual({ entries: [], kind: 'entries' })
  })

  it('treats an empty box as no overrides, which is what {} means on the wire', () => {
    // The server refuses '' outright — json.Unmarshal("") is "unexpected end of JSON
    // input" (verified live) — so the editor must not read a cleared box as a value.
    expect(parseRateLimitGroups('   ')).toEqual({ entries: [], kind: 'entries' })
  })

  it('sorts entries by group so editing one row does not reshuffle the rest', () => {
    const parsed = parseRateLimitGroups('{"vip":[0,5000],"default":[200,100]}')
    expect(parsed).toEqual({
      entries: [
        { group: 'default', success: 100, total: 200 },
        { group: 'vip', success: 5000, total: 0 },
      ],
      kind: 'entries',
    })
  })

  it('refuses to table-ify malformed JSON instead of showing an empty table', () => {
    expect(parseRateLimitGroups('not json')).toEqual({ kind: 'unsupported', reason: 'invalid-json' })
  })

  it('refuses an array, which JSON.parse accepts but the server cannot use', () => {
    expect(parseRateLimitGroups('[1,2]')).toEqual({ kind: 'unsupported', reason: 'not-an-object' })
  })

  it('refuses a three-element entry rather than dropping the third number', () => {
    // The server ACCEPTS this: map[string][2]int absorbs what fits and discards the rest
    // (verified live, success:true). Showing it as a two-column row would make the console
    // claim a value the operator never typed.
    expect(parseRateLimitGroups('{"vip":[1,2,3]}')).toEqual({
      kind: 'unsupported',
      reason: 'unsupported-entry',
    })
  })

  it('refuses a fractional limit, which the server rejects outright', () => {
    expect(parseRateLimitGroups('{"vip":[1.5,2]}')).toEqual({
      kind: 'unsupported',
      reason: 'unsupported-entry',
    })
  })

  it('refuses a non-numeric entry rather than coercing it', () => {
    expect(parseRateLimitGroups('{"vip":["0","5000"]}')).toEqual({
      kind: 'unsupported',
      reason: 'unsupported-entry',
    })
  })
})

describe('serializeRateLimitGroups', () => {
  it('writes {} for no rows, never the empty string the server refuses', () => {
    expect(serializeRateLimitGroups([])).toBe('{}')
  })

  it('round-trips through the parser', () => {
    const entries = [
      { group: 'vip', success: 5000, total: 0 },
      { group: 'default', success: 100, total: 200 },
    ]
    const parsed = parseRateLimitGroups(serializeRateLimitGroups(entries))
    expect(parsed.kind).toBe('entries')
    expect(parsed.kind === 'entries' ? parsed.entries : []).toEqual([
      { group: 'default', success: 100, total: 200 },
      { group: 'vip', success: 5000, total: 0 },
    ])
  })
})

describe('validateRateLimitEntry', () => {
  it('accepts a total of 0, which turns the group’s total limit off', () => {
    expect(validateRateLimitEntry({ group: 'vip', success: 1, total: 0 }, [])).toEqual({})
  })

  it('rejects a success count of 0, which the server refuses as limits[1] < 1', () => {
    expect(validateRateLimitEntry({ group: 'vip', success: 0, total: 0 }, [])).toEqual({
      success: 'success-range',
    })
  })

  it('rejects a negative total, matching limits[0] < 0 server-side', () => {
    expect(validateRateLimitEntry({ group: 'vip', success: 1, total: -1 }, [])).toEqual({
      total: 'total-range',
    })
  })

  it('rejects anything past math.MaxInt32, which the server names explicitly', () => {
    expect(validateRateLimitEntry({ group: 'vip', success: 2147483648, total: 0 }, [])).toEqual({
      success: 'success-range',
    })
  })

  it('rejects a blank group name', () => {
    expect(validateRateLimitEntry({ group: '  ', success: 1, total: 0 }, [])).toEqual({
      group: 'group-required',
    })
  })

  it('rejects a duplicate group, which JSON would silently collapse into one row', () => {
    expect(validateRateLimitEntry({ group: 'vip', success: 1, total: 0 }, ['vip'])).toEqual({
      group: 'group-duplicate',
    })
  })

  it('does not report a row as a duplicate of itself', () => {
    // The caller passes every OTHER row, so re-saving an unchanged row is clean.
    expect(validateRateLimitEntry({ group: 'vip', success: 1, total: 0 }, ['default'])).toEqual({})
  })

  it('rejects a cleared number field rather than writing NaN', () => {
    expect(validateRateLimitEntry({ group: 'vip', success: Number.NaN, total: Number.NaN }, [])).toEqual(
      { success: 'success-range', total: 'total-range' },
    )
  })
})

describe('upsertRateLimitEntry', () => {
  it('replaces the row with the same group rather than adding a second one', () => {
    const next = upsertRateLimitEntry(
      [{ group: 'vip', success: 100, total: 0 }],
      { group: 'vip', success: 500, total: 10 },
      'vip',
    )
    expect(next).toEqual([{ group: 'vip', success: 500, total: 10 }])
  })

  it('drops the old key when a row is renamed', () => {
    const next = upsertRateLimitEntry(
      [
        { group: 'vip', success: 100, total: 0 },
        { group: 'default', success: 50, total: 0 },
      ],
      { group: 'svip', success: 100, total: 0 },
      'vip',
    )
    expect(next.map((entry) => entry.group)).toEqual(['default', 'svip'])
  })
})

describe('removeRateLimitEntry', () => {
  it('removes only the named group', () => {
    const next = removeRateLimitEntry(
      [
        { group: 'vip', success: 100, total: 0 },
        { group: 'default', success: 50, total: 0 },
      ],
      'vip',
    )
    expect(next).toEqual([{ group: 'default', success: 50, total: 0 }])
  })
})
