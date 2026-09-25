// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AreaChart } from '@/components/chart/AreaChart'
import { BarChart } from '@/components/chart/BarChart'
import { LineChart } from '@/components/chart/LineChart'

afterEach(cleanup)

const emptySeries = [{ name: 'Requests', points: [] }]

describe('charts with no data', () => {
  it.each([
    ['LineChart', <LineChart key="l" label="Volume" series={emptySeries} />],
    ['AreaChart', <AreaChart key="a" label="Volume" series={emptySeries} />],
    ['BarChart', <BarChart key="b" label="Volume" series={emptySeries} />],
  ])('%s does not date the x axis from the unix epoch', (_name, node) => {
    render(node)

    // With no points the x extent collapses to [0, 0]; formatting that as a time
    // stamps "Jan 01" 1970 onto an axis that is showing nothing.
    expect(screen.queryByText(/Jan 0?1/)).not.toBeInTheDocument()
    expect(screen.queryByText('1970')).not.toBeInTheDocument()
  })

  it('hides the axis labels entirely, including a caller-supplied time format', () => {
    // The dashboard formats x as a date. With no points the extent is [0, 0], so any
    // label at all would be the epoch — an axis for data that is not there.
    render(
      <LineChart
        emptyLabel="No usage in this period"
        formatX={(value) => new Date(value * 1000).toDateString()}
        label="Volume"
        series={emptySeries}
      />,
    )

    expect(screen.getByText('No usage in this period')).toBeInTheDocument()
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Thu Jan/)).not.toBeInTheDocument()
  })

  it('still renders the accessible frame so the empty state is announced', () => {
    render(<LineChart label="Volume" series={emptySeries} />)

    expect(screen.getByRole('img', { name: 'Volume' })).toBeInTheDocument()
  })
})
