import type { ChartCurve, ChartPoint } from '@/components/chart/types'
import type { PlotProjection } from '@/components/chart/scales'

export type ProjectedPoint = {
  x: number
  y: number
}

/** Two decimals keeps the emitted path strings small without visible error. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Maps data points into viewBox coordinates, dropping non-finite values and
 * sorting ascending by x so a line never doubles back on itself.
 */
export function projectPoints(
  points: readonly ChartPoint[],
  projection: PlotProjection,
): ProjectedPoint[] {
  return points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .slice()
    .sort((left, right) => left.x - right.x)
    .map((point) => ({ x: round(projection.x.scale(point.x)), y: round(projection.y.scale(point.y)) }))
}

function linearPath(points: readonly ProjectedPoint[]): string {
  const [first, ...rest] = points
  if (first === undefined) return ''
  const segments = rest.map((point) => `L ${point.x} ${point.y}`)
  return [`M ${first.x} ${first.y}`, ...segments].join(' ')
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson, as in d3's `curveMonotoneX`).
 *
 * Each segment's control points sit a third of the way in from its own ends, so
 * the curve never leaves its segment horizontally — unevenly spaced samples, such
 * as sparse hourly buckets, cannot make it loop back past the axis the way
 * Catmull-Rom does. Tangents are flattened at local extremes, so it never swings
 * above or below the data either (no dip under zero between two zero readings).
 */
function smoothPath(points: readonly ProjectedPoint[]): string {
  const first = points[0]
  if (first === undefined) return ''
  if (points.length < 3) return linearPath(points)

  const secants = points.slice(1).map((next, index) => {
    const current = points[index]
    const width = next.x - current.x
    return width === 0 ? 0 : (next.y - current.y) / width
  })

  const tangents = points.map((point, index) => {
    if (index === 0) return secants[0]
    if (index === points.length - 1) return secants[secants.length - 1]
    const before = secants[index - 1]
    const after = secants[index]
    if (before * after <= 0) return 0
    const widthBefore = point.x - points[index - 1].x
    const widthAfter = points[index + 1].x - point.x
    const weighted = (before * widthAfter + after * widthBefore) / (widthBefore + widthAfter)
    return Math.sign(before) * Math.min(Math.abs(before), Math.abs(after), Math.abs(weighted) / 2) * 2
  })

  const commands: string[] = [`M ${first.x} ${first.y}`]

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const third = (next.x - current.x) / 3

    const control1X = round(current.x + third)
    const control1Y = round(current.y + tangents[index] * third)
    const control2X = round(next.x - third)
    const control2Y = round(next.y - tangents[index + 1] * third)

    commands.push(`C ${control1X} ${control1Y} ${control2X} ${control2Y} ${next.x} ${next.y}`)
  }

  return commands.join(' ')
}

/** The stroked outline of a series. Returns `''` when there is nothing to draw. */
export function buildLinePath(points: readonly ProjectedPoint[], curve: ChartCurve = 'linear'): string {
  if (points.length === 0) return ''
  const single = points[0]
  if (points.length === 1 && single !== undefined) return `M ${single.x} ${single.y} L ${single.x} ${single.y}`
  return curve === 'smooth' ? smoothPath(points) : linearPath(points)
}

/** The same outline closed down to `baseline` so it can be filled. */
export function buildAreaPath(
  points: readonly ProjectedPoint[],
  baseline: number,
  curve: ChartCurve = 'linear',
): string {
  if (points.length === 0) return ''
  const first = points[0]
  const last = points[points.length - 1]
  if (first === undefined || last === undefined) return ''

  const outline = buildLinePath(points, curve)
  if (outline === '') return ''
  return `${outline} L ${last.x} ${round(baseline)} L ${first.x} ${round(baseline)} Z`
}
