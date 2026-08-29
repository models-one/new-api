import { ChartFrame } from '@/components/chart/ChartFrame'
import { chartTrackColor, seriesColor } from '@/components/chart/palette'
import type { ChartSegment, ChartTableRow } from '@/components/chart/types'
import { formatCompactNumber, formatPercent } from '@/lib/format'

type DonutChartProps = {
  /** Accessible name for the plot. */
  label: string
  segments: readonly ChartSegment[]
  title?: string
  description?: string
  height?: number
  /** Ring thickness in viewBox units (the ring spans 100 units across). */
  thickness?: number
  formatValue?: (value: number) => string
  /** Caption under the centre value. */
  centerLabel?: string
  /** Defaults to the formatted total of every segment. */
  centerValue?: string
  /** Renders the swatch/value list under the ring. */
  showLegend?: boolean
  categoryHeader?: string
  /** Column name for the value list in the screen-reader table. */
  valueHeader?: string
  emptyLabel?: string
  className?: string
}

export function DonutChart(props: DonutChartProps) {
  const {
    formatValue = formatCompactNumber,
    height = 220,
    segments,
    showLegend = true,
    thickness = 14,
  } = props

  const total = segments.reduce(
    (sum, segment) => sum + (Number.isFinite(segment.value) ? Math.max(0, segment.value) : 0),
    0,
  )
  const radius = (100 - thickness) / 2

  // `pathLength=100` turns the dash array into plain percentages, so no arc
  // trigonometry is needed and the slices always close exactly at 100.
  let consumed = 0
  const slices = segments.map((segment, index) => {
    const value = Number.isFinite(segment.value) ? Math.max(0, segment.value) : 0
    const percent = total > 0 ? (value / total) * 100 : 0
    const slice = {
      key: `${index}-${segment.name}`,
      name: segment.name,
      color: seriesColor(index, segment.tone),
      offset: consumed,
      percent,
      value,
    }
    consumed += percent
    return slice
  })

  const rows: ChartTableRow[] = slices.map((slice) => ({
    key: slice.key,
    header: slice.name,
    cells: [`${formatValue(slice.value)} (${formatPercent(slice.percent)})`],
  }))

  return (
    <ChartFrame
      className={props.className}
      description={props.description}
      emptyLabel={props.emptyLabel}
      footer={
        showLegend && slices.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {slices.map((slice) => (
              <li className="flex items-center gap-3" key={slice.key}>
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="min-w-0 flex-1 truncate text-muted">{slice.name}</span>
                <span className="mono shrink-0 font-semibold text-foreground">
                  {formatValue(slice.value)}
                </span>
                <span className="mono w-14 shrink-0 text-right text-muted">
                  {formatPercent(slice.percent)}
                </span>
              </li>
            ))}
          </ul>
        ) : null
      }
      frame="plain"
      height={height}
      label={props.label}
      overlay={
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="mono text-2xl font-bold text-foreground">
              {props.centerValue ?? formatValue(total)}
            </p>
            {props.centerLabel !== undefined ? (
              <p className="eyebrow mt-1">{props.centerLabel}</p>
            ) : null}
          </div>
        </div>
      }
      preserveAspectRatio="xMidYMid meet"
      table={{
        caption: props.title ?? props.label,
        categoryHeader: props.categoryHeader,
        headers: [props.valueHeader ?? ''],
        rows,
      }}
      title={props.title}
    >
      <circle
        cx={50}
        cy={50}
        fill="none"
        r={radius}
        stroke={chartTrackColor}
        strokeWidth={thickness}
      />
      {slices.map((slice) => (
        <circle
          cx={50}
          cy={50}
          fill="none"
          key={slice.key}
          pathLength={100}
          r={radius}
          stroke={slice.color}
          strokeDasharray={`${slice.percent} ${100 - slice.percent}`}
          strokeDashoffset={-slice.offset}
          strokeWidth={thickness}
          transform="rotate(-90 50 50)"
        />
      ))}
    </ChartFrame>
  )
}
