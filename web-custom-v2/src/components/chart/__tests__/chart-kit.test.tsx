// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AreaChart } from '@/components/chart/AreaChart'
import { BarChart } from '@/components/chart/BarChart'
import { DonutChart } from '@/components/chart/DonutChart'
import { LineChart } from '@/components/chart/LineChart'
import { Sparkline } from '@/components/chart/Sparkline'
import { niceDomain, niceTicks } from '@/components/chart/scales'
import { buildLinePath } from '@/components/chart/path'
import type { ChartSeries } from '@/components/chart/types'

afterEach(cleanup)

const series: ChartSeries[] = [
  { name: 'Requests', points: [0, 1, 2, 3, 4, 5, 6].map((x) => ({ x, y: 100 + x * 40 })) },
  { name: 'Tokens', dashed: true, points: [0, 1, 2, 3, 4, 5, 6].map((x) => ({ x, y: 60 + x * 25 })) },
]

describe('chart kit', () => {
  it('renders a two-series line chart with a dashed comparison series', () => {
    render(<LineChart label="API volume chart" series={series} title="API volume" />)

    const plot = screen.getByRole('img', { name: 'API volume chart' })
    expect(plot).toBeInTheDocument()
    const paths = plot.querySelectorAll('path')
    expect(paths).toHaveLength(2)
    expect(paths[1]).toHaveAttribute('stroke-dasharray', '4 3')
    expect(paths[0]).toHaveAttribute('stroke', 'var(--color-primary)')
    expect(paths[1]).toHaveAttribute('stroke', 'var(--color-secondary)')
    expect(paths[0]?.getAttribute('d')).toMatch(/^M 0 /)

    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Requests' })).toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(8)
    expect(within(table).getByRole('rowheader', { name: '3' })).toBeInTheDocument()
  })

  it('renders a horizontal distribution bar list', () => {
    render(
      <BarChart
        categories={['gpt-4-turbo', 'claude-3-opus', 'llama-3-70b']}
        formatValue={(value) => `${value}%`}
        label="Token usage by model"
        orientation="horizontal"
        series={[{ name: 'Share', points: [{ x: 0, y: 45 }, { x: 1, y: 30 }, { x: 2, y: 15 }] }]}
      />,
    )

    const plot = screen.getByRole('img', { name: 'Token usage by model' })
    expect(plot.querySelectorAll('rect')).toHaveLength(3)
    expect(screen.getAllByText('gpt-4-turbo').length).toBeGreaterThan(0)
    expect(within(screen.getByRole('table')).getByRole('rowheader', { name: 'claude-3-opus' })).toBeInTheDocument()
  })

  it('renders donut slices that close at 100 and expose values', () => {
    render(
      <DonutChart
        centerLabel="Total"
        label="Spend by provider"
        segments={[{ name: 'OpenAI', value: 75 }, { name: 'Anthropic', value: 25 }]}
      />,
    )

    const circles = screen.getByRole('img', { name: 'Spend by provider' }).querySelectorAll('circle')
    expect(circles).toHaveLength(3)
    expect(circles[1]).toHaveAttribute('stroke-dasharray', '75 25')
    expect(circles[2]).toHaveAttribute('stroke-dashoffset', '-75')
    expect(screen.getAllByText('100').length).toBeGreaterThan(0)
  })

  it('renders an area chart and a sparkline with an accessible table', () => {
    render(<AreaChart label="Balance trend" series={[series[0] as ChartSeries]} />)
    expect(screen.getByRole('img', { name: 'Balance trend' }).querySelectorAll('path')).toHaveLength(2)
    cleanup()

    render(<Sparkline label="Requests last 7 days" points={series[0]?.points ?? []} showLastPoint />)
    expect(screen.getByRole('img', { name: 'Requests last 7 days' })).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByRole('columnheader', { name: 'Value' })).toBeInTheDocument()
  })

  it('shows the empty state when no data is supplied', () => {
    render(<LineChart label="Empty chart" series={[]} />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  it('generates rounded ticks and domains', () => {
    expect(niceTicks(0, 96, 5)).toEqual([0, 20, 40, 60, 80, 100])
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
    expect(niceDomain(3, 96, 5)).toEqual([0, 100])
    expect(niceTicks(5, 5, 5).length).toBeGreaterThan(1)
    expect(buildLinePath([], 'smooth')).toBe('')
  })
})
