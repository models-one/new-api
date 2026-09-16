import { describe, expect, it } from 'vitest'

import {
  formatLogDayTime,
  logAdminOtherEntries,
  logOtherEntries,
  logsSpanMultipleDays,
} from '@/features/logs/log-presentation'

/**
 * `other` verbatim from a `GET /api/log/` management row on the dev server, plus the
 * `stream_status` shape `service.appendStreamStatus` writes for a relay row.
 */
const ADMIN_OTHER = JSON.stringify({
  model_ratio: 2.5,
  op: { action: 'option.update', params: { key: 'model_deployment.ionet.enabled' } },
  admin_info: { admin_id: 1, admin_username: 'root', admin_role: 100, auth_method: 'session' },
  audit_info: { method: 'POST', route: '/api/option/', status: 200, success: true },
  stream_status: { status: 'error', end_reason: 'aborted', error_count: 2, errors: ['boom'] },
})

/** The same row after `model.formatUserLogs` deleted all three admin roots. */
const SELF_OTHER = JSON.stringify({
  model_ratio: 2.5,
  op: { action: 'option.update', params: { key: 'model_deployment.ionet.enabled' } },
})

describe('logOtherEntries', () => {
  it('keeps the admin-only roots out of the user-visible metadata list', () => {
    const keys = logOtherEntries({ other: ADMIN_OTHER }).map((entry) => entry.rawKey)

    expect(keys).toContain('model_ratio')
    expect(keys).toContain('op.action')
    expect(keys).toContain('op.params.key')
    // They are not dropped, they move to the admin section — see below.
    expect(keys).not.toContain('admin_info')
    expect(keys).not.toContain('audit_info')
    expect(keys).not.toContain('stream_status')
    expect(keys.some((key) => key.startsWith('admin_info.'))).toBe(false)
  })

  it('is unchanged by the split for a payload that never carried the admin roots', () => {
    expect(logOtherEntries({ other: SELF_OTHER }).map((entry) => entry.rawKey)).toEqual([
      'op.action',
      'model_ratio',
      'op.params.key',
    ])
  })
})

describe('logAdminOtherEntries', () => {
  it('flattens the three admin roots into rows keyed by their full backend path', () => {
    const entries = logAdminOtherEntries({ other: ADMIN_OTHER })
    const keys = entries.map((entry) => entry.rawKey)

    expect(keys).toEqual([
      'admin_info.admin_id',
      'admin_info.admin_role',
      'admin_info.admin_username',
      'admin_info.auth_method',
      'audit_info.method',
      'audit_info.route',
      'audit_info.status',
      'audit_info.success',
      'stream_status.end_reason',
      'stream_status.error_count',
      'stream_status.errors',
      'stream_status.status',
    ])
    // The term shown is the raw path, never a guessed label — `admin_info` is written
    // by three producers with three different key sets.
    expect(entries[0].displayKey).toBe('admin_info.admin_id')
    expect(entries.every((entry) => entry.labelKey === undefined)).toBe(true)
  })

  it('keeps a false value, which is a real audit result rather than a missing one', () => {
    const entries = logAdminOtherEntries({
      other: '{"audit_info":{"success":false,"status":403}}',
    })

    expect(entries.map((entry) => [entry.rawKey, entry.value])).toEqual([
      ['audit_info.status', 403],
      ['audit_info.success', false],
    ])
  })

  it('leaves an array whole instead of numbering its members', () => {
    const entries = logAdminOtherEntries({ other: '{"stream_status":{"errors":["a","b"]}}' })

    expect(entries).toHaveLength(1)
    expect(entries[0].value).toEqual(['a', 'b'])
  })

  it('returns nothing for a stripped payload or an unparseable blob', () => {
    expect(logAdminOtherEntries({ other: SELF_OTHER })).toEqual([])
    expect(logAdminOtherEntries({ other: 'not json' })).toEqual([])
    expect(logAdminOtherEntries({ other: '' })).toEqual([])
  })
})

/**
 * Rows on the seeded instance land on several days under the default "all time"
 * range, which is what made a column of bare clock times read as unsorted.
 */
describe('logsSpanMultipleDays', () => {
  const noon = Math.floor(new Date(2026, 8, 16, 12, 0, 0).getTime() / 1000)
  const oneHour = 60 * 60

  it('is false while every row lands on the same local day', () => {
    expect(logsSpanMultipleDays([noon, noon - oneHour, noon - 6 * oneHour])).toBe(false)
  })

  it('is true as soon as one row crosses midnight, even inside a 24-hour window', () => {
    expect(logsSpanMultipleDays([noon, noon - 20 * oneHour])).toBe(true)
  })

  it('ignores rows with no usable timestamp instead of treating them as a second day', () => {
    expect(logsSpanMultipleDays([0, noon, Number.NaN, noon + 60])).toBe(false)
  })

  it('is false for an empty or single-row page', () => {
    expect(logsSpanMultipleDays([])).toBe(false)
    expect(logsSpanMultipleDays([noon])).toBe(false)
  })
})

describe('formatLogDayTime', () => {
  it('carries the day and the clock, and leaves the year to the row detail', () => {
    const seconds = Math.floor(Date.UTC(2026, 8, 16, 12, 0, 0) / 1000)
    const formatted = formatLogDayTime(seconds, 'en-US')

    expect(formatted).toMatch(/Sep/)
    expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(formatted).not.toMatch(/2026/)
  })

  it('renders a missing timestamp as a dash rather than the epoch', () => {
    expect(formatLogDayTime(0, 'en-US')).toBe('—')
    expect(formatLogDayTime(-1, 'en-US')).toBe('—')
  })
})
