import type {
  ChartPoint,
  ChartRawSeries,
  ChartSeries,
  ChartTable,
  ChartTableRow,
} from '@/components/chart/types'
import { extent } from '@/components/chart/scales'

export type SeriesExtent = {
  x: [number, number]
  y: [number, number]
}

/**
 * Shapes arbitrary rows into a {@link ChartSeries} using accessors, so a caller
 * with `{ day, requests }` records does not have to pre-map them.
 */
export function toChartSeries<TItem>(
  raw: ChartRawSeries<TItem>,
  xAccessor: (item: TItem, index: number) => number,
  yAccessor: (item: TItem, index: number) => number,
): ChartSeries {
  const points: ChartPoint[] = raw.data.map((item, index) => ({
    x: xAccessor(item, index),
    y: yAccessor(item, index),
  }))

  return { name: raw.name, points, tone: raw.tone, dashed: raw.dashed }
}

/** Combined x and y extents across every series. */
export function seriesExtent(series: readonly ChartSeries[]): SeriesExtent {
  const xValues: number[] = []
  const yValues: number[] = []

  for (const entry of series) {
    for (const point of entry.points) {
      xValues.push(point.x)
      yValues.push(point.y)
    }
  }

  return { x: extent(xValues), y: extent(yValues) }
}

export function seriesPointCount(series: readonly ChartSeries[]): number {
  return series.reduce((longest, entry) => Math.max(longest, entry.points.length), 0)
}

/** Every distinct x value across the series, ascending. */
export function seriesCategories(series: readonly ChartSeries[]): number[] {
  const seen = new Set<number>()

  for (const entry of series) {
    for (const point of entry.points) {
      if (Number.isFinite(point.x)) seen.add(point.x)
    }
  }

  return [...seen].sort((left, right) => left - right)
}

/**
 * Builds the screen-reader table every chart renders beside its plot: one row
 * per x value, one column per series. Missing observations become an em dash.
 */
export function buildSeriesTable(options: {
  series: readonly ChartSeries[]
  caption?: string
  categoryHeader?: string
  /** Overrides the row header for the nth category. */
  categories?: readonly string[]
  formatX?: (value: number, index: number) => string
  formatValue?: (value: number) => string
}): ChartTable {
  const formatX = options.formatX ?? ((value: number) => String(value))
  const formatValue = options.formatValue ?? ((value: number) => String(value))
  const categories = seriesCategories(options.series)

  const lookups = options.series.map((entry) => {
    const byX = new Map<number, number>()
    for (const point of entry.points) byX.set(point.x, point.y)
    return byX
  })

  const rows: ChartTableRow[] = categories.map((category, index) => ({
    key: `${index}-${category}`,
    header: options.categories?.[index] ?? formatX(category, index),
    cells: lookups.map((byX) => {
      const value = byX.get(category)
      return value === undefined ? '—' : formatValue(value)
    }),
  }))

  return {
    caption: options.caption,
    categoryHeader: options.categoryHeader,
    headers: options.series.map((entry) => entry.name),
    rows,
  }
}
