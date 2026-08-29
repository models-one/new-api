import { ChartFrame } from '@/components/chart/ChartFrame'
import { seriesColor } from '@/components/chart/palette'
import { buildLinePath, projectPoints } from '@/components/chart/path'
import {
  createPlotProjection,
  horizontalTicks,
  niceDomain,
  sampleDomain,
  verticalTicks,
} from '@/components/chart/scales'
import { buildSeriesTable, seriesCategories, seriesExtent } from '@/components/chart/series'
import type { ChartCurve, ChartLegendItem, ChartSeries } from '@/components/chart/types'
import { formatCompactNumber } from '@/lib/format'

type LineChartProps = {
  /** Accessible name for the plot. */
  label: string
  series: readonly ChartSeries[]
  title?: string
  description?: string
  height?: number
  curve?: ChartCurve
  /** Formats y values for the axis, legend, and screen-reader table. */
  formatValue?: (value: number) => string
  /** Formats x values for the axis and the table's row headers. */
  formatX?: (value: number, index: number) => string
  xTickCount?: number
  yTickCount?: number
  /** Pins the value axis instead of deriving a nice domain from the data. */
  yDomain?: readonly [number, number]
  showLegend?: boolean
  /** Row-header column name in the screen-reader table. */
  categoryHeader?: string
  emptyLabel?: string
  className?: string
}

export function LineChart(props: LineChartProps) {
  const {
    curve = 'smooth',
    formatValue = formatCompactNumber,
    formatX = (value: number) => formatCompactNumber(value),
    height = 220,
    series,
    showLegend = true,
    xTickCount = 5,
    yTickCount = 5,
  } = props

  const bounds = seriesExtent(series)
  const yDomain = props.yDomain ?? niceDomain(bounds.y[0], bounds.y[1], yTickCount)
  const projection = createPlotProjection({ xDomain: bounds.x, yDomain })

  const categories = seriesCategories(series)
  const xValues =
    categories.length > 1 && categories.length <= xTickCount
      ? categories
      : sampleDomain(bounds.x, xTickCount)

  const legend: ChartLegendItem[] = series.map((entry, index) => ({
    name: entry.name,
    color: seriesColor(index, entry.tone),
    dashed: entry.dashed,
    shape: 'line',
  }))

  return (
    <ChartFrame
      className={props.className}
      description={props.description}
      emptyLabel={props.emptyLabel}
      height={height}
      label={props.label}
      legend={showLegend ? legend : []}
      table={buildSeriesTable({
        series,
        caption: props.title ?? props.label,
        categoryHeader: props.categoryHeader,
        formatValue,
        formatX,
      })}
      title={props.title}
      xTicks={horizontalTicks(projection.x, xValues, formatX)}
      yTicks={verticalTicks(projection.y, projection.y.ticks(yTickCount), formatValue)}
    >
      {series.map((entry, index) => (
        <path
          d={buildLinePath(projectPoints(entry.points, projection), curve)}
          fill="none"
          key={`${index}-${entry.name}`}
          stroke={seriesColor(index, entry.tone)}
          strokeDasharray={entry.dashed === true ? '4 3' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </ChartFrame>
  )
}
