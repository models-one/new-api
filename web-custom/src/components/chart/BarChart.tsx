import { ChartFrame } from '@/components/chart/ChartFrame'
import { chartAxisColor, seriesColor } from '@/components/chart/palette'
import {
  clamp,
  createLinearScale,
  horizontalTicks,
  niceDomain,
  verticalTicks,
} from '@/components/chart/scales'
import { buildSeriesTable, seriesCategories, seriesExtent } from '@/components/chart/series'
import type {
  AxisTick,
  ChartLegendItem,
  ChartOrientation,
  ChartSeries,
} from '@/components/chart/types'
import { CHART_VIEWBOX_HEIGHT, CHART_VIEWBOX_WIDTH } from '@/components/chart/types'
import { formatCompactNumber } from '@/lib/format'

type BarChartProps = {
  /** Accessible name for the plot. */
  label: string
  /** One entry per series. Bars are grouped by shared x value. */
  series: readonly ChartSeries[]
  /** Overrides the category label for the nth bar group. */
  categories?: readonly string[]
  /** `horizontal` produces the distribution bar list layout. */
  orientation?: ChartOrientation
  title?: string
  description?: string
  height?: number
  formatValue?: (value: number) => string
  formatX?: (value: number, index: number) => string
  valueTickCount?: number
  /** Pins the value axis instead of deriving a nice domain from the data. */
  valueDomain?: readonly [number, number]
  showLegend?: boolean
  /** Width of the category label gutter when horizontal. */
  axisWidth?: number
  categoryHeader?: string
  emptyLabel?: string
  className?: string
}

/** Share of each group's slot taken by bars; the remainder is the gap. */
const GROUP_FILL = 0.68

export function BarChart(props: BarChartProps) {
  const {
    formatValue = formatCompactNumber,
    formatX = (value: number) => formatCompactNumber(value),
    height = 220,
    orientation = 'vertical',
    series,
    valueTickCount = 5,
  } = props

  const isHorizontal = orientation === 'horizontal'
  const showLegend = props.showLegend ?? series.length > 1
  const bounds = seriesExtent(series)
  const valueDomain =
    props.valueDomain ??
    niceDomain(Math.min(0, bounds.y[0]), Math.max(0, bounds.y[1]), valueTickCount)

  const categories = seriesCategories(series)
  const groupCount = Math.max(categories.length, 1)
  const categoryLabel = (index: number): string =>
    props.categories?.[index] ?? formatX(categories[index] ?? index, index)

  // The value scale always spans the full viewBox; the category axis is split
  // into equal slots, one per group, so bars stay aligned across series.
  const valueScale = isHorizontal
    ? createLinearScale(valueDomain, [0, CHART_VIEWBOX_WIDTH])
    : createLinearScale(valueDomain, [CHART_VIEWBOX_HEIGHT, 0])
  const zeroInDomain = valueDomain[0] <= 0 && valueDomain[1] >= 0
  const baseline = valueScale.scale(zeroInDomain ? 0 : valueDomain[0])

  const slot = (isHorizontal ? CHART_VIEWBOX_HEIGHT : CHART_VIEWBOX_WIDTH) / groupCount
  const bandSize = (slot * GROUP_FILL) / Math.max(series.length, 1)
  const bandStart = (slot * (1 - GROUP_FILL)) / 2

  const valueTicks = valueScale.ticks(valueTickCount)
  const categoryTicks: AxisTick[] = categories.map((category, index) => ({
    key: `${index}-${category}`,
    // Horizontal groups read top-down, so the first category sits highest.
    position: isHorizontal
      ? clamp(1 - (index + 0.5) / groupCount, 0, 1)
      : clamp((index + 0.5) / groupCount, 0, 1),
    label: categoryLabel(index),
  }))

  const legend: ChartLegendItem[] = series.map((entry, index) => ({
    name: entry.name,
    color: seriesColor(index, entry.tone),
    shape: 'square',
  }))

  return (
    <ChartFrame
      axisWidth={props.axisWidth ?? (isHorizontal ? 104 : 44)}
      className={props.className}
      description={props.description}
      emptyLabel={props.emptyLabel}
      height={height}
      label={props.label}
      legend={showLegend ? legend : []}
      table={buildSeriesTable({
        series,
        caption: props.title ?? props.label,
        categories: props.categories,
        categoryHeader: props.categoryHeader,
        formatValue,
        formatX,
      })}
      title={props.title}
      xTicks={
        isHorizontal
          ? horizontalTicks(valueScale, valueTicks, formatValue)
          : categoryTicks
      }
      yTicks={
        isHorizontal
          ? categoryTicks
          : verticalTicks(valueScale, valueTicks, formatValue)
      }
    >
      {zeroInDomain && valueDomain[0] < 0 ? (
        <line
          stroke={chartAxisColor}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          x1={isHorizontal ? baseline : 0}
          x2={isHorizontal ? baseline : CHART_VIEWBOX_WIDTH}
          y1={isHorizontal ? 0 : baseline}
          y2={isHorizontal ? CHART_VIEWBOX_HEIGHT : baseline}
        />
      ) : null}

      {series.map((entry, seriesIndex) => {
        const color = seriesColor(seriesIndex, entry.tone)
        const byCategory = new Map(entry.points.map((point) => [point.x, point.y]))

        return (
          <g fill={color} key={`${seriesIndex}-${entry.name}`}>
            {categories.map((category, groupIndex) => {
              const value = byCategory.get(category)
              if (value === undefined || !Number.isFinite(value)) return null

              const projected = valueScale.scale(value)
              const start = groupIndex * slot + bandStart + seriesIndex * bandSize
              const thickness = Math.max(bandSize * (series.length > 1 ? 0.86 : 1), 0.4)
              const length = Math.abs(projected - baseline)

              return isHorizontal ? (
                <rect
                  height={thickness}
                  key={`${groupIndex}-${category}`}
                  width={Math.max(length, 0.4)}
                  x={Math.min(projected, baseline)}
                  y={start}
                />
              ) : (
                <rect
                  height={Math.max(length, 0.4)}
                  key={`${groupIndex}-${category}`}
                  width={thickness}
                  x={start}
                  y={Math.min(projected, baseline)}
                />
              )
            })}
          </g>
        )
      })}
    </ChartFrame>
  )
}
