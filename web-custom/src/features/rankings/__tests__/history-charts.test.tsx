// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { ModelHistorySeries } from '@/features/rankings/api'
import { ModelVolumeChart, VendorShareChart } from '@/features/rankings/components/HistoryCharts'

/**
 * A thirty-bucket month history, the shape `/api/rankings?period=month` really returns. One
 * model has traffic in every bucket; a second appears only in the last three, which is how the
 * server encodes "no traffic" — it omits the point rather than sending a zero.
 */
function monthHistory(): ModelHistorySeries {
  const points: ModelHistorySeries['points'] = []
  for (let day = 0; day < 30; day += 1) {
    const ts = `2026-08-${String(day + 1).padStart(2, '0')}T00:00:00Z`
    const label = `Aug ${day + 1}`
    points.push({ ts, label, model: 'gpt-4o-mini', vendor: 'OpenAI', tokens: 1000 + day })
    if (day >= 27) {
      points.push({ ts, label, model: 'newcomer', vendor: 'Unknown', tokens: 50 })
    }
  }
  return {
    buckets: 30,
    models: [
      { name: 'gpt-4o-mini', vendor: 'OpenAI', total: 30_000 },
      { name: 'newcomer', vendor: 'Unknown', total: 150 },
    ],
    points,
  }
}

afterEach(cleanup)

describe('ModelVolumeChart axis', () => {
  it('labels each tick with the bucket it sits on, across the whole window', () => {
    const { container } = render(<ModelVolumeChart history={monthHistory()} periodLabel="Last 30 days" />)

    // The axis strip is aria-hidden — the screen-reader table carries the values — so it has to
    // be read out of the DOM. `LineChart` samples ticks evenly once the buckets outnumber
    // xTickCount and hands the formatter a fractional x plus a tick ORDINAL; formatting by that
    // ordinal would print Aug 1..Aug 6 evenly spread over a thirty-day plot, a time axis this
    // data never had.
    const drawn = [...container.querySelectorAll('[aria-hidden="true"] span')]
      .map((node) => node.textContent ?? '')
      .filter((text) => text.startsWith('Aug '))

    expect(drawn.length).toBeGreaterThan(2)
    expect(drawn.at(0)).toBe('Aug 1')
    expect(drawn.at(-1)).toBe('Aug 30')

    const days = drawn.map((text) => Number(text.slice('Aug '.length)))
    // Every drawn date is a bucket that exists, and they climb across the window.
    expect(days.every((day) => day >= 1 && day <= 30)).toBe(true)
    expect([...days].sort((left, right) => left - right)).toEqual(days)
    expect(new Set(days).size).toBe(days.length)
  })

  it('gives the screen-reader table one exact row per bucket', () => {
    render(<ModelVolumeChart history={monthHistory()} periodLabel="Last 30 days" />)

    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    // 30 buckets plus the header row.
    expect(rows).toHaveLength(31)
    expect(within(table).getByRole('columnheader', { name: 'gpt-4o-mini' })).toBeInTheDocument()
    // A bucket the model had no point in reads as the zero the chart draws, not as data.
    expect(within(table).getAllByRole('rowheader', { name: 'Aug 1' })).toHaveLength(1)
    expect(within(table).getAllByRole('rowheader', { name: 'Aug 30' })).toHaveLength(1)
  })

  it('says the leaderboard is empty rather than drawing an axis with no data', () => {
    render(
      <ModelVolumeChart
        history={{ buckets: 0, models: [], points: [] }}
        periodLabel="Last 30 days"
      />,
    )

    expect(screen.getByRole('heading', { name: 'No history yet' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('VendorShareChart', () => {
  it('plots the per-bucket share the server already normalised, as a percentage', () => {
    render(
      <VendorShareChart
        history={{
          buckets: 2,
          points: [
            { ts: '2026-08-01T00:00:00Z', label: 'Aug 1', vendor: 'OpenAI', share: 0.6, tokens: 60 },
            { ts: '2026-08-01T00:00:00Z', label: 'Aug 1', vendor: 'Others', share: 0.4, tokens: 40 },
            { ts: '2026-08-02T00:00:00Z', label: 'Aug 2', vendor: 'OpenAI', share: 1, tokens: 90 },
          ],
          vendors: [
            { name: 'OpenAI', total: 150, share: 0.79 },
            { name: 'Others', total: 40, share: 0.21 },
          ],
        }}
        periodLabel="Last 7 days"
      />,
    )

    const table = screen.getByRole('table')
    expect(within(table).getByRole('cell', { name: '60.0%' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { name: '40.0%' })).toBeInTheDocument()
    // The bucket where the tail vendor sent nothing is filled with the identity of no traffic.
    expect(within(table).getByRole('cell', { name: '0.0%' })).toBeInTheDocument()
    // The server's English `Others` constant is translated at display time, not treated as a
    // provider name — here the English locale, so it reads the same but goes through t().
    expect(within(table).getByRole('columnheader', { name: 'Others' })).toBeInTheDocument()
  })
})
