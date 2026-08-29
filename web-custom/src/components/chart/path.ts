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
 * Catmull-Rom through every point, converted to cubic beziers. Endpoints are
 * duplicated so the curve starts and ends exactly on the data.
 */
function smoothPath(points: readonly ProjectedPoint[]): string {
  const first = points[0]
  if (first === undefined) return ''
  if (points.length < 3) return linearPath(points)

  const commands: string[] = [`M ${first.x} ${first.y}`]

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(index - 1, 0)]
    const current = points[index]
    const next = points[index + 1]
    const following = points[Math.min(index + 2, points.length - 1)]

    const control1X = round(current.x + (next.x - previous.x) / 6)
    const control1Y = round(current.y + (next.y - previous.y) / 6)
    const control2X = round(next.x - (following.x - current.x) / 6)
    const control2Y = round(next.y - (following.y - current.y) / 6)

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
