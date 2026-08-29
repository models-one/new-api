import { clampDataRange } from '@/lib/api/usage-data'
import { toUnixSeconds } from '@/lib/format'

const HOUR_SECONDS = 3_600
const DAY_SECONDS = 24 * HOUR_SECONDS

/** How many months the picker offers, counting the current one. */
export const BILLING_MONTH_OPTION_COUNT = 6

export type BillingMonth = {
  /** `YYYY-MM`, used as the select value and the React key. */
  id: string
  year: number
  /** 0-based, matching `Date#getMonth`. */
  month: number
}

export type BillingWindow = {
  month: BillingMonth
  /** Local midnight on the 1st of the month. */
  monthStart: number
  /**
   * The latest instant the month can cover: the hour boundary at or before now for
   * the current month, the last second of the month for a finished one.
   */
  monthEnd: number
  /** What the request actually asks for, after the 30 day clamp. */
  start: number
  end: number
  /** True when the server's 30 day span limit pushed `start` past `monthStart`. */
  clamped: boolean
  isCurrentMonth: boolean
  daysInMonth: number
  /** Length of the charted window in days, fractional while the month is running. */
  chartedDays: number
}

function monthId(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function startOfMonth(year: number, month: number): number {
  return toUnixSeconds(new Date(year, month, 1))
}

/** The current month first, then the preceding ones, newest to oldest. */
export function recentBillingMonths(
  now: Date,
  count: number = BILLING_MONTH_OPTION_COUNT,
): BillingMonth[] {
  const months: BillingMonth[] = []
  for (let offset = 0; offset < count; offset += 1) {
    // Day 1 keeps the rollover exact: `getMonth() - offset` normalises the year.
    const cursor = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    months.push({
      id: monthId(cursor.getFullYear(), cursor.getMonth()),
      month: cursor.getMonth(),
      year: cursor.getFullYear(),
    })
  }
  return months
}

/**
 * The window `/api/data/self` and `/api/data/flow/self` are actually asked for.
 *
 * Both endpoints reject a span wider than 30 days outright (verified live: a 31 day
 * calendar month answers `success:false` with "时间跨度不能超过 1 个月" and no data), so
 * `clampDataRange` pulls the start forward and the caller has to say so in the UI —
 * a 31 day month is charted from its 2nd day, not its 1st.
 */
export function resolveBillingWindow(month: BillingMonth, now: Date): BillingWindow {
  const monthStart = startOfMonth(month.year, month.month)
  const nextMonthStart = startOfMonth(month.year, month.month + 1)
  const nowSeconds = toUnixSeconds(now)
  const isCurrentMonth = nowSeconds >= monthStart && nowSeconds < nextMonthStart

  // Rows are stamped at the start of their hour, so flooring now to the hour still
  // covers the in-progress hour while holding the query key steady between renders.
  const monthEnd = isCurrentMonth
    ? Math.floor(nowSeconds / HOUR_SECONDS) * HOUR_SECONDS
    : nextMonthStart - 1

  const { start, end } = clampDataRange(monthStart, monthEnd)

  return {
    chartedDays: (end - start) / DAY_SECONDS,
    clamped: start > monthStart,
    // Rounded because a daylight saving change makes a month 1 hour short or long.
    daysInMonth: Math.round((nextMonthStart - monthStart) / DAY_SECONDS),
    end,
    isCurrentMonth,
    month,
    monthEnd,
    monthStart,
    start,
  }
}

/**
 * A rate measured over a few hours projects noise rather than a month, so no
 * projection is offered until the window covers this many days.
 */
export const MIN_PROJECTION_DAYS = 1

/**
 * CLIENT-SIDE ESTIMATE, never a server figure: the quota spent inside the charted
 * window, divided by the days that window covers, times the days in the month.
 * The UI that renders it must say it is an estimate.
 *
 * Null when the month is already over (there is nothing left to project), when the
 * window is shorter than {@link MIN_PROJECTION_DAYS}, and when nothing was spent —
 * projecting zero forward states a certainty the data does not support.
 */
export function projectMonthlyQuota(quotaSpent: number, window: BillingWindow): number | null {
  if (!window.isCurrentMonth) return null
  if (!Number.isFinite(quotaSpent) || quotaSpent <= 0) return null
  if (window.chartedDays < MIN_PROJECTION_DAYS) return null
  return (quotaSpent / window.chartedDays) * window.daysInMonth
}

export function formatBillingMonth(month: BillingMonth, locale?: string): string {
  return new Date(month.year, month.month, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  })
}
