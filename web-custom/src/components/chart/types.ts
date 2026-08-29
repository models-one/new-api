import type { Tone } from '@/components/ui/tone'

/** One plotted observation. `x` is numeric (index, unix millisecond, or bucket). */
export type ChartPoint = {
  x: number
  y: number
}

/** A named line/area/bar series. `tone` overrides the palette slot for its index. */
export type ChartSeries = {
  name: string
  points: readonly ChartPoint[]
  tone?: Tone
  /** Renders the stroke dashed. Used for comparison/forecast series. */
  dashed?: boolean
}

/** Unshaped input for {@link toChartSeries}. */
export type ChartRawSeries<TItem> = {
  name: string
  data: readonly TItem[]
  tone?: Tone
  dashed?: boolean
}

/** A donut/proportion slice. */
export type ChartSegment = {
  name: string
  value: number
  tone?: Tone
}

/**
 * An axis label. `position` is a 0..1 fraction along the axis measured from its
 * origin: 0 is the left edge for x, the bottom edge for y.
 */
export type AxisTick = {
  key: string
  position: number
  label: string
}

export type ChartLegendShape = 'line' | 'square'

export type ChartLegendItem = {
  name: string
  /** A token color string such as `var(--color-primary)`. Never a hex literal. */
  color: string
  shape?: ChartLegendShape
  dashed?: boolean
}

export type ChartTableRow = {
  key: string
  /** Row header cell — the category, timestamp, or bucket label. */
  header: string
  cells: readonly string[]
}

/**
 * The screen-reader table rendered by {@link ChartFrame}. A chart's aria-label
 * communicates nothing about values, so every chart ships its data as a table.
 */
export type ChartTable = {
  caption?: string
  categoryHeader?: string
  /** One header per value column. An empty string falls back to a translated "Value". */
  headers: readonly string[]
  rows: readonly ChartTableRow[]
}

export type ChartCurve = 'linear' | 'smooth'

export type ChartOrientation = 'vertical' | 'horizontal'

/** Internal viewBox coordinate system shared by every plot. */
export const CHART_VIEWBOX_WIDTH = 100
export const CHART_VIEWBOX_HEIGHT = 100
