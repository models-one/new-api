import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { AxisTick, ChartLegendItem, ChartTable } from '@/components/chart/types'
import { CHART_VIEWBOX_HEIGHT, CHART_VIEWBOX_WIDTH } from '@/components/chart/types'
import { clamp } from '@/components/chart/scales'
import { cn } from '@/lib/utils'

type ChartFrameProps = {
  /** Accessible name for the plot. Required — a chart with no name is unusable. */
  label: string
  /** Visible caption above the plot. */
  title?: string
  description?: string
  /** Plot height in pixels. Width always fills the container. */
  height?: number
  /** `grid` paints the `.data-grid` plot background with its axis rules. */
  frame?: 'grid' | 'plain'
  xTicks?: readonly AxisTick[]
  yTicks?: readonly AxisTick[]
  /** Width of the y-axis label gutter in pixels. */
  axisWidth?: number
  legend?: readonly ChartLegendItem[]
  /** The screen-reader data table. A label alone communicates no values. */
  table: ChartTable
  /** Shown in place of the plot when the table has no rows. */
  emptyLabel?: string
  /** SVG content, drawn in the viewBox coordinate system. */
  children?: ReactNode
  /** HTML drawn over the plot box — donut centres, sparkline markers. */
  overlay?: ReactNode
  viewBoxWidth?: number
  viewBoxHeight?: number
  /** `none` stretches the plot to the container; donuts need `xMidYMid meet`. */
  preserveAspectRatio?: string
  footer?: ReactNode
  className?: string
  plotClassName?: string
}

function horizontalTickStyle(position: number): CSSProperties {
  const fraction = clamp(position, 0, 1)
  if (fraction <= 0.02) return { left: 0 }
  if (fraction >= 0.98) return { right: 0 }
  return { left: `${fraction * 100}%`, transform: 'translateX(-50%)' }
}

/**
 * Axis labels are positioned by fraction, so two of them can land on top of each other
 * whenever the plot is narrow or the labels are long — "$10.00" printed over "$15.00"
 * reads as a rendering fault, not as a dense axis. Keeping the first of each colliding
 * run leaves every surviving tick exactly where it was.
 *
 * `text-[11px]` in the mono stack is close enough to 0.62em per character for this; the
 * estimate only has to be good enough to decide which labels fit.
 */
const TICK_CHARACTER_WIDTH = 6.9
const TICK_LABEL_GAP = 8

function dropCollidingTicks(ticks: readonly AxisTick[], width: number): readonly AxisTick[] {
  if (width <= 0 || ticks.length < 2) return ticks
  const kept: AxisTick[] = []
  let lastRight = Number.NEGATIVE_INFINITY
  for (const tick of ticks) {
    const labelWidth = tick.label.length * TICK_CHARACTER_WIDTH
    const centre = clamp(tick.position, 0, 1) * width
    const left = Math.max(0, Math.min(centre - labelWidth / 2, width - labelWidth))
    if (left < lastRight + TICK_LABEL_GAP) continue
    kept.push(tick)
    lastRight = left + labelWidth
  }
  // An axis reduced to a single label says less than no axis at all, but it is still
  // honest; only bail out to the raw list when the estimate rejected everything.
  return kept.length > 0 ? kept : ticks.slice(0, 1)
}

function verticalTickStyle(position: number): CSSProperties {
  const fraction = clamp(position, 0, 1)
  if (fraction <= 0.02) return { bottom: 0 }
  if (fraction >= 0.98) return { top: 0 }
  return { bottom: `${fraction * 100}%`, transform: 'translateY(50%)' }
}

export function ChartFrame(props: ChartFrameProps) {
  const { t } = useTranslation()
  const {
    axisWidth = 44,
    frame = 'grid',
    height = 220,
    legend = [],
    preserveAspectRatio = 'none',
    viewBoxHeight = CHART_VIEWBOX_HEIGHT,
    viewBoxWidth = CHART_VIEWBOX_WIDTH,
    xTicks = [],
    yTicks = [],
  } = props

  const hasHeader = props.title !== undefined || props.description !== undefined || legend.length > 0
  const isEmpty = props.table.rows.length === 0
  // With no rows the scales collapse to a zero-width extent, so every tick sits on the
  // domain's start. Rendering those is worse than rendering none: a time-formatted axis
  // labels the empty chart with the unix epoch.
  const visibleYTicks = isEmpty ? [] : yTicks
  const categoryHeader = props.table.categoryHeader ?? t('Category')

  const tickRowRef = useRef<HTMLDivElement | null>(null)
  const [tickRowWidth, setTickRowWidth] = useState(0)

  useEffect(() => {
    const node = tickRowRef.current
    if (node === null) return
    const update = () => setTickRowWidth(node.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const visibleXTicks = isEmpty ? [] : dropCollidingTicks(xTicks, tickRowWidth)

  return (
    <div className={cn('flex min-w-0 flex-col gap-4', props.className)}>
      {hasHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          {props.title !== undefined || props.description !== undefined ? (
            <div className="min-w-0">
              {props.title !== undefined ? (
                <p className="text-base font-bold text-foreground">{props.title}</p>
              ) : null}
              {props.description !== undefined ? (
                <p className="mt-1 text-sm text-muted">{props.description}</p>
              ) : null}
            </div>
          ) : null}

          {legend.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
              {legend.map((item, index) => (
                <li className="flex items-center gap-2" key={`${index}-${item.name}`}>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'shrink-0',
                      item.shape === 'square' ? 'size-2.5 rounded-[2px]' : 'h-0.5 w-5',
                    )}
                    style={
                      item.dashed && item.shape !== 'square'
                        ? {
                            backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 7px)`,
                          }
                        : { backgroundColor: item.color }
                    }
                  />
                  {item.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-w-0 gap-3">
        {visibleYTicks.length > 0 ? (
          <div
            aria-hidden="true"
            className="relative shrink-0"
            style={{ height, width: axisWidth }}
          >
            {visibleYTicks.map((tick) => (
              <span
                className="mono absolute right-0 max-w-full truncate text-[11px] leading-none text-muted"
                key={tick.key}
                style={verticalTickStyle(tick.position)}
              >
                {tick.label}
              </span>
            ))}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'relative w-full',
              frame === 'grid' && 'data-grid border-b border-l border-border',
              props.plotClassName,
            )}
            style={{ height }}
          >
            <svg
              aria-label={props.label}
              className="absolute inset-0 size-full overflow-visible"
              preserveAspectRatio={preserveAspectRatio}
              role="img"
              viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
            >
              {isEmpty ? null : props.children}
            </svg>

            {isEmpty ? (
              <p className="absolute inset-0 grid place-items-center text-xs text-muted">
                {props.emptyLabel ?? t('No data')}
              </p>
            ) : (
              props.overlay
            )}
          </div>

          {isEmpty ? null : (
            <div aria-hidden="true" className="relative mt-2 h-4" ref={tickRowRef}>
              {visibleXTicks.map((tick) => (
                <span
                  className="mono absolute max-w-full truncate text-[11px] leading-none text-muted"
                  key={tick.key}
                  style={horizontalTickStyle(tick.position)}
                >
                  {tick.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {props.footer}

      <table className="sr-only">
        <caption>{props.table.caption ?? props.label}</caption>
        <thead>
          <tr>
            <th scope="col">{categoryHeader}</th>
            {props.table.headers.map((header, index) => (
              <th key={`${index}-${header}`} scope="col">
                {header.trim() === '' ? t('Value') : header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.table.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.header}</th>
              {row.cells.map((cell, index) => (
                <td className="mono" key={`${row.key}-${index}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
