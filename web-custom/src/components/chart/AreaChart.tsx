import { ChartFrame } from '@/components/chart/ChartFrame'
import { seriesColor } from '@/components/chart/palette'
import { buildAreaPath, buildLinePath, projectPoints } from '@/components/chart/path'
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

type AreaChartProps = {
  /** Accessible name for the plot. */
  label: string
  series: readonly ChartSeries[]
  title?: string
  description?: string
  height?: number
  curve?: ChartCurve
  /** Opacity of the filled body. The stroke stays fully opaque. */
  fillOpacity?: number
  formatValue?: (value: number) => string
  formatX?: (value: number, index: number) => string
  xTickCount?: number
  yTickCount?: number
  yDomain?: readonly [number, number]
  showLegend?: boolean
  categoryHeader?: string
  emptyLabel?: string
  className?: string
}

export function AreaChart(props: AreaChartProps) {
  const {
    curve = 'smooth',
    fillOpacity = 0.18,
    formatValue = formatCompactNumber,
    formatX = (value: number) => formatCompactNumber(value),
    height = 220,
    series,
    showLegend = true,
    xTickCount = 5,
    yTickCount = 5,
  } = props

  const bounds = seriesExtent(series)
  // Areas read as volume, so the fill is anchored at zero whenever data allows.
  const yDomain =
    props.yDomain ?? niceDomain(Math.min(0, bounds.y[0]), Math.max(0, bounds.y[1]), yTickCount)
  const projection = createPlotProjection({ xDomain: bounds.x, yDomain })
  const zeroInDomain = yDomain[0] <= 0 && yDomain[1] >= 0
  const baseline = projection.y.scale(zeroInDomain ? 0 : yDomain[0])

  const categories = seriesCategories(series)
  const xValues =
    categories.length > 1 && categories.length <= xTickCount
      ? categories
      : sampleDomain(bounds.x, xTickCount)

  const legend: ChartLegendItem[] = series.map((entry, index) => ({
    name: entry.name,
    color: seriesColor(index, entry.tone),
    dashed: entry.dashed,
    shape: 'square',
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
      {series.map((entry, index) => {
        const points = projectPoints(entry.points, projection)
        const color = seriesColor(index, entry.tone)

        return (
          <g key={`${index}-${entry.name}`}>
            <path d={buildAreaPath(points, baseline, curve)} fill={color} fillOpacity={fillOpacity} />
            <path
              d={buildLinePath(points, curve)}
              fill="none"
              stroke={color}
              strokeDasharray={entry.dashed === true ? '4 3' : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </ChartFrame>
  )
}
