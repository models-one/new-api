import { ChartFrame } from '@/components/chart/ChartFrame'
import { seriesColor } from '@/components/chart/palette'
import { buildAreaPath, buildLinePath, projectPoints } from '@/components/chart/path'
import { createPlotProjection, horizontalFraction, niceDomain, verticalFraction } from '@/components/chart/scales'
import { buildSeriesTable } from '@/components/chart/series'
import type { ChartCurve, ChartPoint } from '@/components/chart/types'
import type { Tone } from '@/components/ui/tone'
import { formatCompactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

type SparklineProps = {
  /** Accessible name — a bare trend line is meaningless without one. */
  label: string
  points: readonly ChartPoint[]
  tone?: Tone
  height?: number
  curve?: ChartCurve
  /** Fills under the line. */
  showArea?: boolean
  /** Marks the most recent observation with a dot. */
  showLastPoint?: boolean
  formatValue?: (value: number) => string
  formatX?: (value: number, index: number) => string
  /** Value column name in the screen-reader table. */
  valueLabel?: string
  categoryHeader?: string
  emptyLabel?: string
  className?: string
}

export function Sparkline(props: SparklineProps) {
  const {
    curve = 'smooth',
    formatValue = formatCompactNumber,
    formatX = (value: number) => formatCompactNumber(value),
    height = 40,
    points,
    showArea = true,
    showLastPoint = false,
  } = props

  const color = seriesColor(0, props.tone)
  const xValues = points.map((point) => point.x)
  const yValues = points.map((point) => point.y)
  const xDomain: [number, number] = [
    xValues.length > 0 ? Math.min(...xValues) : 0,
    xValues.length > 0 ? Math.max(...xValues) : 1,
  ]
  const yDomain = niceDomain(
    yValues.length > 0 ? Math.min(...yValues) : 0,
    yValues.length > 0 ? Math.max(...yValues) : 1,
    3,
  )

  const projection = createPlotProjection({ xDomain, yDomain, inset: 3 })
  const projected = projectPoints(points, projection)
  const last = projected[projected.length - 1]

  return (
    <ChartFrame
      className={cn('gap-0', props.className)}
      emptyLabel={props.emptyLabel}
      frame="plain"
      height={height}
      label={props.label}
      overlay={
        showLastPoint && last !== undefined ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-1.5 rounded-full"
            style={{
              backgroundColor: color,
              left: `${horizontalFraction(last.x) * 100}%`,
              bottom: `${verticalFraction(last.y) * 100}%`,
              transform: 'translate(-50%, 50%)',
            }}
          />
        ) : null
      }
      table={buildSeriesTable({
        series: [{ name: props.valueLabel ?? '', points }],
        caption: props.label,
        categoryHeader: props.categoryHeader,
        formatValue,
        formatX,
      })}
    >
      {showArea ? (
        <path
          d={buildAreaPath(projected, projection.height, curve)}
          fill={color}
          fillOpacity={0.16}
        />
      ) : null}
      <path
        d={buildLinePath(projected, curve)}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </ChartFrame>
  )
}
