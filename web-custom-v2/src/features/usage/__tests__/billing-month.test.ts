import { describe, expect, it } from 'vitest'

import {
  MIN_PROJECTION_DAYS,
  projectMonthlyQuota,
  recentBillingMonths,
  resolveBillingWindow,
} from '@/features/usage/billing-month'
import { MAX_DATA_RANGE_SECONDS } from '@/lib/api/usage-data'
import { toUnixSeconds } from '@/lib/format'

const DAY_SECONDS = 86_400

describe('recentBillingMonths', () => {
  it('starts at the current month and walks back across the year boundary', () => {
    const months = recentBillingMonths(new Date(2026, 1, 10), 3)

    expect(months.map((month) => month.id)).toEqual(['2026-02', '2026-01', '2025-12'])
  })
})

describe('resolveBillingWindow', () => {
  it('clamps a 31 day month to the 30 day span the server accepts', () => {
    const [july] = recentBillingMonths(new Date(2026, 6, 15), 1)
    const window = resolveBillingWindow(july, new Date(2026, 7, 20))

    expect(window.isCurrentMonth).toBe(false)
    expect(window.daysInMonth).toBe(31)
    expect(window.clamped).toBe(true)
    // Exactly the ceiling, not one second more: the request is rejected outright above it.
    expect(window.end - window.start).toBe(MAX_DATA_RANGE_SECONDS)
    expect(window.start).toBeGreaterThan(window.monthStart)
  })

  it('leaves a 30 day month unclamped and ends it on its last second', () => {
    const [june] = recentBillingMonths(new Date(2026, 5, 15), 1)
    const window = resolveBillingWindow(june, new Date(2026, 7, 20))

    expect(window.clamped).toBe(false)
    expect(window.start).toBe(window.monthStart)
    expect(window.end).toBe(toUnixSeconds(new Date(2026, 6, 1)) - 1)
  })

  it('ends the running month on the hour so the query key holds still', () => {
    const now = new Date(2026, 7, 20, 10, 42, 31)
    const [august] = recentBillingMonths(now, 1)
    const window = resolveBillingWindow(august, now)

    expect(window.isCurrentMonth).toBe(true)
    expect(window.clamped).toBe(false)
    expect(window.end).toBe(toUnixSeconds(new Date(2026, 7, 20, 10, 0, 0)))
    expect(window.chartedDays).toBeCloseTo(19 + 10 / 24, 5)
  })
})

describe('projectMonthlyQuota', () => {
  it('extends the charted daily rate across the whole month', () => {
    const now = new Date(2026, 7, 11, 0, 0, 0)
    const [august] = recentBillingMonths(now, 1)
    const window = resolveBillingWindow(august, now)

    // Ten full days charted, 1_000_000 quota spent, 31 days in August.
    expect(window.chartedDays).toBe(10)
    expect(projectMonthlyQuota(1_000_000, window)).toBe(3_100_000)
  })

  it('offers no projection until a full day has been charted', () => {
    const now = new Date(2026, 7, 1, 20, 0, 0)
    const [august] = recentBillingMonths(now, 1)
    const window = resolveBillingWindow(august, now)

    expect(window.chartedDays).toBeLessThan(MIN_PROJECTION_DAYS)
    expect(projectMonthlyQuota(500_000, window)).toBeNull()
  })

  it('offers no projection for a finished month or for a window with no spend', () => {
    const now = new Date(2026, 7, 20)
    const [august] = recentBillingMonths(now, 1)
    const [july] = recentBillingMonths(new Date(2026, 6, 15), 1)

    expect(projectMonthlyQuota(1_000_000, resolveBillingWindow(july, now))).toBeNull()
    expect(projectMonthlyQuota(0, resolveBillingWindow(august, now))).toBeNull()
  })

  it('never divides by a window shorter than a day', () => {
    const now = new Date(2026, 7, 1, 0, 30, 0)
    const [august] = recentBillingMonths(now, 1)
    const window = resolveBillingWindow(august, now)

    expect(window.end - window.start).toBeLessThan(DAY_SECONDS)
    expect(projectMonthlyQuota(999_999, window)).toBeNull()
  })
})
