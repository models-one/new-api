import { describe, expect, it } from 'vitest'

import {
  RUNOUT_WINDOW_SECONDS,
  VOLUME_RANGE_SECONDS,
  averageSuccessRate,
  estimateRunoutDays,
  formatRunoutDays,
  hourWindowEnd,
  vendorInitials,
} from '@/features/dashboard/estimates'
import { MAX_DATA_RANGE_SECONDS } from '@/lib/api/usage-data'

describe('dashboard estimates', () => {
  it('keeps the widest chart window at the range the server accepts', () => {
    expect(VOLUME_RANGE_SECONDS['30d']).toBe(MAX_DATA_RANGE_SECONDS)
    expect(RUNOUT_WINDOW_SECONDS).toBe(VOLUME_RANGE_SECONDS['24h'])
  })

  it('ends the data window on the next hour boundary', () => {
    const end = hourWindowEnd(new Date('2026-08-29T12:34:56Z'))

    expect(end).toBe(Math.floor(Date.parse('2026-08-29T13:00:00Z') / 1000))
  })

  it('projects the balance against the last day of spend', () => {
    expect(estimateRunoutDays(100_000_000, 2_000_000)).toBe(50)
  })

  it('has no estimate when the window cost nothing or the balance is gone', () => {
    expect(estimateRunoutDays(100_000_000, 0)).toBeNull()
    expect(estimateRunoutDays(0, 2_000_000)).toBeNull()
    expect(estimateRunoutDays(Number.NaN, 2_000_000)).toBeNull()
  })

  it('keeps a decimal only while the projection is under ten days', () => {
    expect(formatRunoutDays(0.42)).toBe('0.4')
    expect(formatRunoutDays(57.8)).toBe('58')
  })

  it('averages success rates with equal weight and reports nothing when empty', () => {
    expect(
      averageSuccessRate([
        { model_name: 'a', avg_latency_ms: 100, success_rate: 100, avg_tps: 10 },
        { model_name: 'b', avg_latency_ms: 200, success_rate: 90, avg_tps: 20 },
      ]),
    ).toBe(95)
    expect(averageSuccessRate([])).toBeNull()
  })

  it('builds provider initials from letters only', () => {
    expect(vendorInitials('OpenAI')).toBe('OPE')
    expect(vendorInitials('x-ai')).toBe('XAI')
    expect(vendorInitials('')).toBe('')
  })
})
